import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { calculateTotals } from "@/lib/orders/totals";
import { formatYen } from "@/lib/format";
import type {
  EstimateStatus,
  InvoiceStatus,
  OrderItem,
  WorkItemCategory,
  WorkStatus,
} from "@/lib/types";

export const metadata: Metadata = {
  title: "売上集計 | HIIRAGI",
};

type SalesRow = {
  id: string;
  invoiced_at: string;
  paid_at: string | null;
  work_status: WorkStatus;
  estimate_status: EstimateStatus;
  invoice_status: InvoiceStatus;
  items: OrderItem[];
  discount_amount: number;
  customer: { id: string; name: string } | null;
};

function pickInt(
  v: string | string[] | undefined,
  fallback: number,
): number {
  if (!v || Array.isArray(v)) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function formatDateOnly(iso: string): string {
  // ISO timestamptz から YYYY/MM/DD 部分だけ取り出す
  return iso.slice(0, 10).replace(/-/g, "/");
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const year = pickInt(sp?.year, now.getFullYear());
  const monthRaw = pickInt(sp?.month, now.getMonth() + 1);
  const month = Math.min(12, Math.max(1, monthRaw));

  // 月の境界（タイムゾーンは Asia/Tokyo を想定。invoiced_at は timestamptz なので
  // ISO 文字列に +09:00 を付けて範囲指定）
  const start = `${year}-${pad2(month)}-01T00:00:00+09:00`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = `${nextYear}-${pad2(nextMonth)}-01T00:00:00+09:00`;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [ordersRes, catsRes] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, invoiced_at, paid_at, work_status, estimate_status, invoice_status, items, discount_amount, customer:customers(id,name)",
      )
      .eq("user_id", user!.id)
      .in("invoice_status", ["請求済", "入金済"])
      .gte("invoiced_at", start)
      .lt("invoiced_at", end)
      .order("invoiced_at", { ascending: true }),
    // 業務カテゴリ一覧（削除済みも含む。集計画面では過去のカテゴリ名を保持して見せるため）
    supabase
      .from("work_item_categories")
      .select("*")
      .eq("user_id", user!.id)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);
  const error = ordersRes.error;
  const rows = (ordersRes.data ?? []) as unknown as SalesRow[];
  const allCategories = (catsRes.data ?? []) as WorkItemCategory[];

  // 売上計上ロジック
  // work_status='完了' なら売上、それ以外は前受金
  //
  // 表示金額は「items合計 − discount_amount」（税抜・値引き反映後）。
  // calculateTotals の section 別ロジックでは値引きが整備セクションを超えた分が
  // 反映されない（車検整備中心の受注に値引きを設定したケース等）ので、ここでは
  // フラットに引いて「実際の請求額に近い金額」を出す。0 未満になる場合は 0。
  const enriched = rows.map((o) => {
    const totals = calculateTotals(o.items ?? [], o.discount_amount, 0);
    const total = Math.max(0, totals.subtotal - totals.discount);
    return {
      ...o,
      total,
      isComplete: o.work_status === "完了",
    };
  });
  const salesTotal = enriched
    .filter((o) => o.isComplete)
    .reduce((acc, o) => acc + o.total, 0);
  const advanceTotal = enriched
    .filter((o) => !o.isComplete)
    .reduce((acc, o) => acc + o.total, 0);

  // ====================
  // 業務カテゴリ別 / 税区分別の小計
  // ====================
  // 売上計上対象（売上 + 前受金 = enriched 全体）の orders.items を走査して、
  // item_category_id ごとの「税抜・値引き前」小計を集計する。
  // 旧 type/tax_free しか持たない明細は legacy 名でフォールバック逆引き。
  const categoryNameMap = new Map(allCategories.map((c) => [c.id, c]));
  const categoryByName = new Map(allCategories.map((c) => [c.name, c]));

  function legacyNameFor(item: OrderItem): string {
    if (item.type === "shaken" && item.tax_free === true) return "車検法定費用";
    if (item.type === "shaken") return "車検整備";
    return "整備";
  }

  const subtotalsByCategoryId = new Map<string, number>();
  let taxableBucket = 0;
  let shakenNonTaxBucket = 0;
  for (const o of rows) {
    for (const it of o.items ?? []) {
      const sub = Math.round((it.unit_price ?? 0) * (it.quantity ?? 0));
      // 業務カテゴリの解決
      let catId = it.item_category_id ?? "";
      if (!catId) {
        catId = categoryByName.get(legacyNameFor(it))?.id ?? "_orphan";
      }
      subtotalsByCategoryId.set(
        catId,
        (subtotalsByCategoryId.get(catId) ?? 0) + sub,
      );
      // 税区分の振り分け（item_category_id 経由ではなく明細自身の tax_category / 旧 tax_free を見る）
      const isShakenNonTax =
        it.tax_category === "shaken_non_tax" ||
        (it.tax_category == null && it.tax_free === true);
      if (isShakenNonTax) shakenNonTaxBucket += sub;
      else taxableBucket += sub;
    }
  }

  type CategoryRow = {
    id: string;
    name: string;
    subtotal: number;
    isDeleted: boolean;
    isOrphan: boolean;
  };
  const categoryRows: CategoryRow[] = [];
  const handled = new Set<string>();
  for (const c of allCategories) {
    const sub = subtotalsByCategoryId.get(c.id) ?? 0;
    if (sub === 0) continue;
    categoryRows.push({
      id: c.id,
      name: c.name,
      subtotal: sub,
      isDeleted: c.deleted_at !== null,
      isOrphan: false,
    });
    handled.add(c.id);
  }
  for (const [k, v] of subtotalsByCategoryId) {
    if (handled.has(k)) continue;
    if (v === 0) continue;
    const cat = categoryNameMap.get(k);
    categoryRows.push({
      id: k,
      name: cat?.name ?? "（カテゴリ未分類）",
      subtotal: v,
      isDeleted: cat?.deleted_at != null,
      isOrphan: !cat,
    });
  }
  const categorySumTotal = categoryRows.reduce((a, r) => a + r.subtotal, 0);

  // 前後の月（ナビ用）
  const prev =
    month === 1
      ? { year: year - 1, month: 12 }
      : { year, month: month - 1 };
  const next =
    month === 12
      ? { year: year + 1, month: 1 }
      : { year, month: month + 1 };

  const navLinkClass =
    "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800";

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          売上集計
        </h2>
      </div>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        請求済または入金済の受注を、請求書発行日（invoiced_at）の月で集計します。作業完了は売上、未完了は前受金として分類されます。
      </p>

      {/* 月別ナビゲーション */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/sales?year=${prev.year}&month=${prev.month}`}
            className={navLinkClass}
          >
            ← 前月
          </Link>
          <h3 className="px-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {year}年 {month}月
          </h3>
          <Link
            href={`/dashboard/sales?year=${next.year}&month=${next.month}`}
            className={navLinkClass}
          >
            翌月 →
          </Link>
        </div>
        <Link
          href={`/dashboard/sales?year=${now.getFullYear()}&month=${now.getMonth() + 1}`}
          className={navLinkClass}
        >
          今月へ
        </Link>
      </div>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          売上集計の取得に失敗しました: {error.message}
        </p>
      )}

      {/* サマリー */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <SummaryCard
          label="売上"
          subLabel="作業完了 + 請求済"
          value={salesTotal}
          tone="green"
        />
        <SummaryCard
          label="前受金"
          subLabel="作業未完了 + 請求済"
          value={advanceTotal}
          tone="amber"
        />
        <SummaryCard
          label="合計"
          subLabel={`${enriched.length} 件`}
          value={salesTotal + advanceTotal}
          tone="zinc"
        />
      </div>

      {/* カテゴリ別 / 税区分別 小計 */}
      {enriched.length > 0 && (
        <div className="mt-8 grid gap-4 lg:grid-cols-[2fr_1fr]">
          {/* 業務カテゴリ別 */}
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="border-b border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-900 dark:border-zinc-800 dark:text-zinc-50">
              業務カテゴリ別
            </h3>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {categoryRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={2}
                      className="px-4 py-6 text-center text-xs text-zinc-500 dark:text-zinc-400"
                    >
                      対象明細がありません。
                    </td>
                  </tr>
                ) : (
                  categoryRows.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-2 text-zinc-900 dark:text-zinc-50">
                        {c.isDeleted || c.isOrphan
                          ? `（削除済み）${c.name}`
                          : c.name}
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-zinc-900 dark:text-zinc-50">
                        {formatYen(c.subtotal)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {categoryRows.length > 0 && (
                <tfoot className="border-t border-zinc-200 dark:border-zinc-800">
                  <tr>
                    <td className="px-4 py-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      合計
                    </td>
                    <td className="px-4 py-2 text-right text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      {formatYen(categorySumTotal)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* 税区分別 */}
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="border-b border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-900 dark:border-zinc-800 dark:text-zinc-50">
              税区分別
            </h3>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                <tr>
                  <td className="px-4 py-2 text-zinc-900 dark:text-zinc-50">
                    課税対象
                  </td>
                  <td className="px-4 py-2 text-right font-medium text-zinc-900 dark:text-zinc-50">
                    {formatYen(taxableBucket)}
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-2 text-zinc-900 dark:text-zinc-50">
                    車検法定費用
                  </td>
                  <td className="px-4 py-2 text-right font-medium text-zinc-900 dark:text-zinc-50">
                    {formatYen(shakenNonTaxBucket)}
                  </td>
                </tr>
              </tbody>
              <tfoot className="border-t border-zinc-200 dark:border-zinc-800">
                <tr>
                  <td className="px-4 py-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    合計
                  </td>
                  <td className="px-4 py-2 text-right text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {formatYen(taxableBucket + shakenNonTaxBucket)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {enriched.length > 0 && (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          ※ いずれも税抜の金額です。カテゴリ別 / 税区分別の小計は値引き前、サマリーの売上 / 前受金は値引き反映後のため差があります。
        </p>
      )}

      {/* 明細 */}
      <div className="mt-8 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        {enriched.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
            この月に請求済の受注はありません。
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wider text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-medium">請求日</th>
                <th className="px-4 py-3 font-medium">管理番号</th>
                <th className="px-4 py-3 font-medium">顧客名</th>
                <th className="px-4 py-3 font-medium">作業</th>
                <th className="px-4 py-3 font-medium">区分</th>
                <th className="px-4 py-3 text-right font-medium">金額</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {enriched.map((o) => (
                <tr
                  key={o.id}
                  className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                >
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {formatDateOnly(o.invoiced_at)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link
                      href={`/dashboard/orders/${o.id}`}
                      className="text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-50"
                    >
                      {o.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-900 dark:text-zinc-50">
                    {o.customer ? (
                      <Link
                        href={`/dashboard/customers/${o.customer.id}`}
                        className="hover:underline"
                      >
                        {o.customer.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {o.work_status}
                  </td>
                  <td className="px-4 py-3">
                    {o.isComplete ? (
                      <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-950/40 dark:text-green-300">
                        売上
                      </span>
                    ) : (
                      <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                        前受金
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-zinc-900 dark:text-zinc-50">
                    {formatYen(o.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function SummaryCard({
  label,
  subLabel,
  value,
  tone,
}: {
  label: string;
  subLabel: string;
  value: number;
  tone: "green" | "amber" | "zinc";
}) {
  const toneClass = {
    green: "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/20",
    amber: "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20",
    zinc: "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900",
  }[tone];
  const labelTone = {
    green: "text-green-700 dark:text-green-300",
    amber: "text-amber-700 dark:text-amber-300",
    zinc: "text-zinc-600 dark:text-zinc-400",
  }[tone];

  return (
    <div className={`rounded-lg border p-5 ${toneClass}`}>
      <p className={`text-xs font-semibold uppercase tracking-wider ${labelTone}`}>
        {label}
      </p>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{subLabel}</p>
      <p className="mt-3 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        {formatYen(value)}
      </p>
    </div>
  );
}
