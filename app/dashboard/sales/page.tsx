import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TAX_RATE, calculateTotals } from "@/lib/orders/totals";
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
  // 業務カテゴリ別「合計」をサマリーカード（売上 + 前受金）と一致させるための値引き合計。
  // 受注ごとに min(items合計, max(0, discount_amount)) を取って積む。
  // → enriched 側で使う Math.max(0, items合計 − discount) と同じ控除量になり、
  //   categorySumTotal − discountTotal == salesTotal + advanceTotal が成立する。
  let discountTotal = 0;
  // 入金済 / 請求済（未入金）の per-group 集計。キャッシュフロー把握用。
  // 同じ flat 計算式（max(0, items合計 − discount) + floor(課税対象 × 10%）)
  // をグループ単位で再計算する。請求合計（全体）とグループ合計は端数誤差なく一致する。
  let paidTaxable = 0;
  let paidTaxExcl = 0;
  let paidDiscount = 0;
  let paidCount = 0;
  let unpaidTaxable = 0;
  let unpaidTaxExcl = 0;
  let unpaidDiscount = 0;
  let unpaidCount = 0;
  for (const o of rows) {
    let orderItemsSum = 0;
    let orderTaxableSum = 0;
    for (const it of o.items ?? []) {
      const sub = Math.round((it.unit_price ?? 0) * (it.quantity ?? 0));
      orderItemsSum += sub;
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
      else {
        taxableBucket += sub;
        orderTaxableSum += sub;
      }
    }
    const rawDiscount = Math.max(0, o.discount_amount ?? 0);
    const effectiveDiscount = Math.min(orderItemsSum, rawDiscount);
    const orderTaxExcl = Math.max(0, orderItemsSum - rawDiscount);
    discountTotal += effectiveDiscount;

    if (o.invoice_status === "入金済") {
      paidCount += 1;
      paidTaxable += orderTaxableSum;
      paidTaxExcl += orderTaxExcl;
      paidDiscount += effectiveDiscount;
    } else if (o.invoice_status === "請求済") {
      unpaidCount += 1;
      unpaidTaxable += orderTaxableSum;
      unpaidTaxExcl += orderTaxExcl;
      unpaidDiscount += effectiveDiscount;
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

  // ====================
  // 消費税 / 請求合計（税込）
  // ====================
  // 値引きは業務的に課税対象（整備等）へ適用するのが妥当。
  // 車検法定費用（自賠責・重量税・印紙代など）は値引きの対象外。
  // discountTotal を taxableBucket からのみ控除し、その 10% を消費税とする。
  // 端数は受注詳細の calculateTotals と同じ floor 揃え。
  const taxableAfterDiscount = Math.max(0, taxableBucket - discountTotal);
  const consumptionTax = Math.floor(taxableAfterDiscount * TAX_RATE);
  // 請求合計 = 売上 + 前受金 + 消費税。サマリーカードの見た目通り足し算が成立する。
  const totalWithTax = salesTotal + advanceTotal + consumptionTax;

  // キャッシュフロー内訳: 入金済 / 未入金（請求済）の税込合計。
  // 全体と同じ flat 集計式で per-group 再計算するので端数誤差なく
  // paidWithTax + unpaidWithTax == totalWithTax が成立する（rows は 請求済 + 入金済 だけ）。
  const paidTaxAfter = Math.max(0, paidTaxable - paidDiscount);
  const paidTax = Math.floor(paidTaxAfter * TAX_RATE);
  const paidWithTax = paidTaxExcl + paidTax;
  const unpaidTaxAfter = Math.max(0, unpaidTaxable - unpaidDiscount);
  const unpaidTax = Math.floor(unpaidTaxAfter * TAX_RATE);
  const unpaidWithTax = unpaidTaxExcl + unpaidTax;

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

      {/* サマリー: モバイル 2x2 / lg 以上で 1x4 */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard
          label="売上"
          subLabel="作業完了 + 請求済（税抜）"
          value={salesTotal}
          tone="green"
        />
        <SummaryCard
          label="前受金"
          subLabel="作業未完了 + 請求済（税抜）"
          value={advanceTotal}
          tone="amber"
        />
        <SummaryCard
          label="消費税"
          subLabel="税率10%"
          value={consumptionTax}
          tone="zinc"
        />
        <SummaryCard
          label="請求合計"
          subLabel={`税込 ・ ${enriched.length}件`}
          value={totalWithTax}
          tone="sky"
        />
      </div>

      {/* キャッシュフロー内訳: 請求合計の入金済 / 未入金（請求済）への分解。
          未入金は /dashboard/payments へリンクして詳細確認できるようにする。 */}
      {enriched.length > 0 && (
        <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50/60 px-5 py-3 dark:border-sky-900 dark:bg-sky-950/15">
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300">
            請求合計の内訳（キャッシュフロー）
          </p>
          <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-sm text-zinc-700 dark:text-zinc-300">
                うち入金済
              </dt>
              <dd className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                {formatYen(paidWithTax)}
                <span className="ml-1 text-xs text-zinc-500 dark:text-zinc-400">
                  （{paidCount}件）
                </span>
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-sm text-zinc-700 dark:text-zinc-300">
                うち未入金
              </dt>
              <dd className="text-sm font-medium">
                {unpaidCount > 0 ? (
                  <Link
                    href="/dashboard/payments"
                    className="text-sky-700 underline-offset-2 hover:underline dark:text-sky-300"
                  >
                    {formatYen(unpaidWithTax)}
                    <span className="ml-1 text-xs">
                      （{unpaidCount}件 →）
                    </span>
                  </Link>
                ) : (
                  <span className="text-zinc-900 dark:text-zinc-50">
                    {formatYen(unpaidWithTax)}
                    <span className="ml-1 text-xs text-zinc-500 dark:text-zinc-400">
                      （0件）
                    </span>
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </div>
      )}

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
                <tfoot>
                  {discountTotal > 0 && (
                    <>
                      <tr className="border-t border-zinc-200 dark:border-zinc-800">
                        <td className="px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300">
                          小計
                        </td>
                        <td className="px-4 py-2 text-right text-sm text-zinc-700 dark:text-zinc-300">
                          {formatYen(categorySumTotal)}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300">
                          値引き合計
                        </td>
                        <td className="px-4 py-2 text-right text-sm text-zinc-700 dark:text-zinc-300">
                          − {formatYen(discountTotal)}
                        </td>
                      </tr>
                    </>
                  )}
                  <tr
                    className={
                      discountTotal > 0
                        ? "border-t-2 border-zinc-900 dark:border-zinc-50"
                        : "border-t border-zinc-200 dark:border-zinc-800"
                    }
                  >
                    <td className="px-4 py-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      合計
                    </td>
                    <td className="px-4 py-2 text-right text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      {formatYen(categorySumTotal - discountTotal)}
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
              <tfoot>
                {discountTotal > 0 && (
                  <>
                    <tr className="border-t border-zinc-200 dark:border-zinc-800">
                      <td className="px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300">
                        小計
                      </td>
                      <td className="px-4 py-2 text-right text-sm text-zinc-700 dark:text-zinc-300">
                        {formatYen(taxableBucket + shakenNonTaxBucket)}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300">
                        値引き合計
                      </td>
                      <td className="px-4 py-2 text-right text-sm text-zinc-700 dark:text-zinc-300">
                        − {formatYen(discountTotal)}
                      </td>
                    </tr>
                  </>
                )}
                <tr
                  className={
                    discountTotal > 0
                      ? "border-t-2 border-zinc-900 dark:border-zinc-50"
                      : "border-t border-zinc-200 dark:border-zinc-800"
                  }
                >
                  <td className="px-4 py-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    合計
                  </td>
                  <td className="px-4 py-2 text-right text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {formatYen(
                      taxableBucket + shakenNonTaxBucket - discountTotal,
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {enriched.length > 0 && (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          ※ 業務カテゴリ別・税区分別はいずれも税抜の金額で、値引きを反映した「合計」がサマリーの「売上 + 前受金」と一致します。税込の請求額はサマリーの「請求合計」をご確認ください。
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
  tone: "green" | "amber" | "zinc" | "sky";
}) {
  const toneClass = {
    green: "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/20",
    amber: "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20",
    zinc: "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900",
    sky: "border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/20",
  }[tone];
  const labelTone = {
    green: "text-green-700 dark:text-green-300",
    amber: "text-amber-700 dark:text-amber-300",
    zinc: "text-zinc-600 dark:text-zinc-400",
    sky: "text-sky-700 dark:text-sky-300",
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
