import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { calculateTotals } from "@/lib/orders/totals";
import { formatYen } from "@/lib/format";
import type {
  EstimateStatus,
  InvoiceStatus,
  OrderItem,
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

  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, invoiced_at, paid_at, work_status, estimate_status, invoice_status, items, discount_amount, customer:customers(id,name)",
    )
    .eq("user_id", user!.id)
    .in("invoice_status", ["請求済", "入金済"])
    .gte("invoiced_at", start)
    .lt("invoiced_at", end)
    .order("invoiced_at", { ascending: true });

  const rows = (data ?? []) as unknown as SalesRow[];

  // 売上計上ロジック
  // work_status='完了' なら売上、それ以外は前受金
  const enriched = rows.map((o) => {
    const totals = calculateTotals(o.items ?? [], o.discount_amount, 0);
    return {
      ...o,
      total: totals.total,
      isComplete: o.work_status === "完了",
    };
  });
  const salesTotal = enriched
    .filter((o) => o.isComplete)
    .reduce((acc, o) => acc + o.total, 0);
  const advanceTotal = enriched
    .filter((o) => !o.isComplete)
    .reduce((acc, o) => acc + o.total, 0);

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
