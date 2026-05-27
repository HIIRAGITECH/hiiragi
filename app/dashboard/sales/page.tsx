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
  let discountTotal = 0;
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
      let catId = it.item_category_id ?? "";
      if (!catId) {
        catId = categoryByName.get(legacyNameFor(it))?.id ?? "_orphan";
      }
      subtotalsByCategoryId.set(
        catId,
        (subtotalsByCategoryId.get(catId) ?? 0) + sub,
      );
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

  const taxableAfterDiscount = Math.max(0, taxableBucket - discountTotal);
  const consumptionTax = Math.floor(taxableAfterDiscount * TAX_RATE);
  const totalWithTax = salesTotal + advanceTotal + consumptionTax;

  const paidTaxAfter = Math.max(0, paidTaxable - paidDiscount);
  const paidTax = Math.floor(paidTaxAfter * TAX_RATE);
  const paidWithTax = paidTaxExcl + paidTax;
  const unpaidTaxAfter = Math.max(0, unpaidTaxable - unpaidDiscount);
  const unpaidTax = Math.floor(unpaidTaxAfter * TAX_RATE);
  const unpaidWithTax = unpaidTaxExcl + unpaidTax;

  const prev =
    month === 1
      ? { year: year - 1, month: 12 }
      : { year, month: month - 1 };
  const next =
    month === 12
      ? { year: year + 1, month: 1 }
      : { year, month: month + 1 };

  return (
    <>
      <div className="wos-pagehead">
        <div className="min-w-0 flex-1">
          <div className="wos-crumbs">会計 ／ 売上集計</div>
          <h1>
            {year}年 {month}月の売上
          </h1>
          <div className="wos-gloss">
            請求書発行日（invoiced_at）の月で集計。作業完了は売上、未完了は前受金として分類されます。
          </div>
        </div>
        <div className="wos-actions">
          <Link
            href={`/dashboard/sales?year=${prev.year}&month=${prev.month}`}
            className="wos-btn-ghost wos-btn-sm"
          >
            ← 前月
          </Link>
          <Link
            href={`/dashboard/sales?year=${next.year}&month=${next.month}`}
            className="wos-btn-ghost wos-btn-sm"
          >
            翌月 →
          </Link>
          <Link
            href={`/dashboard/sales?year=${now.getFullYear()}&month=${now.getMonth() + 1}`}
            className="wos-btn wos-btn-sm"
          >
            今月へ
          </Link>
        </div>
      </div>

      {error && (
        <div className="px-8 pt-4">
          <p className="wos-alert warn">
            売上集計の取得に失敗しました: {error.message}
          </p>
        </div>
      )}

      {/* サマリー 4連 */}
      <div className="grid grid-cols-2 md:grid-cols-4 border-b border-[var(--color-line)] bg-[var(--color-paper)]">
        <SummaryCell label="売上" sub="作業完了・税抜" value={salesTotal} />
        <SummaryCell label="前受金" sub="作業未完了・税抜" value={advanceTotal} />
        <SummaryCell label="消費税" sub="税率10%" value={consumptionTax} />
        <SummaryCell
          label="請求合計"
          sub={`税込・${enriched.length}件`}
          value={totalWithTax}
          accent
          last
        />
      </div>

      <div className="flex-1 overflow-auto bg-[var(--color-cream)]">
        <div className="px-8 py-6 flex flex-col gap-6">
          {/* キャッシュフロー */}
          {enriched.length > 0 && (
            <section className="wos-card">
              <div className="wos-sec-label mb-3">
                請求合計の内訳（キャッシュフロー）
              </div>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                <div className="flex items-baseline justify-between gap-3 border-b border-[var(--color-line)] py-2">
                  <dt className="text-sm text-[var(--color-ink-soft)]">
                    うち入金済
                  </dt>
                  <dd className="wos-yen text-base">
                    {formatYen(paidWithTax)}
                    <span className="ml-2 text-xs text-[var(--color-ink-light)]">
                      （{paidCount}件）
                    </span>
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-b border-[var(--color-line)] py-2">
                  <dt className="text-sm text-[var(--color-ink-soft)]">
                    うち未入金
                  </dt>
                  <dd className="wos-yen text-base">
                    {unpaidCount > 0 ? (
                      <Link
                        href="/dashboard/payments"
                        className="text-[var(--color-accent)] hover:underline"
                      >
                        {formatYen(unpaidWithTax)}
                        <span className="ml-2 text-xs">
                          （{unpaidCount}件 →）
                        </span>
                      </Link>
                    ) : (
                      <>
                        {formatYen(unpaidWithTax)}
                        <span className="ml-2 text-xs text-[var(--color-ink-light)]">
                          （0件）
                        </span>
                      </>
                    )}
                  </dd>
                </div>
              </dl>
            </section>
          )}

          {/* 2ペイン: 業務カテゴリ別 / 税区分別 */}
          {enriched.length > 0 && (
            <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
              <div>
                <div className="wos-sec-label mb-3">業務カテゴリ別</div>
                <table className="w-full border-collapse bg-[var(--color-paper)] border border-[var(--color-line)]">
                  <tbody>
                    {categoryRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={2}
                          className="wos-td text-center muted"
                        >
                          対象明細がありません。
                        </td>
                      </tr>
                    ) : (
                      categoryRows.map((c) => (
                        <tr
                          key={c.id}
                          className="border-b border-[var(--color-line)]"
                        >
                          <td className="wos-td">
                            {c.isDeleted || c.isOrphan
                              ? `（削除済み）${c.name}`
                              : c.name}
                          </td>
                          <td className="wos-td num right">
                            {formatYen(c.subtotal)}
                          </td>
                        </tr>
                      ))
                    )}
                    {categoryRows.length > 0 && discountTotal > 0 && (
                      <>
                        <tr className="border-t border-[var(--color-line)]">
                          <td className="wos-td muted">小計</td>
                          <td className="wos-td num right muted">
                            {formatYen(categorySumTotal)}
                          </td>
                        </tr>
                        <tr>
                          <td className="wos-td muted">値引き合計</td>
                          <td className="wos-td num right muted">
                            − {formatYen(discountTotal)}
                          </td>
                        </tr>
                      </>
                    )}
                    {categoryRows.length > 0 && (
                      <tr className="border-t-2 border-[var(--color-line-strong)] bg-[var(--color-cream)]">
                        <td className="wos-td font-semibold">合計</td>
                        <td className="wos-td num right font-semibold">
                          {formatYen(categorySumTotal - discountTotal)}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div>
                <div className="wos-sec-label mb-3">税区分別</div>
                <table className="w-full border-collapse bg-[var(--color-paper)] border border-[var(--color-line)]">
                  <tbody>
                    <tr className="border-b border-[var(--color-line)]">
                      <td className="wos-td">課税対象</td>
                      <td className="wos-td num right">
                        {formatYen(taxableBucket)}
                      </td>
                    </tr>
                    <tr className="border-b border-[var(--color-line)]">
                      <td className="wos-td">車検法定費用</td>
                      <td className="wos-td num right">
                        {formatYen(shakenNonTaxBucket)}
                      </td>
                    </tr>
                    {discountTotal > 0 && (
                      <>
                        <tr className="border-t border-[var(--color-line)]">
                          <td className="wos-td muted">小計</td>
                          <td className="wos-td num right muted">
                            {formatYen(taxableBucket + shakenNonTaxBucket)}
                          </td>
                        </tr>
                        <tr>
                          <td className="wos-td muted">値引き合計</td>
                          <td className="wos-td num right muted">
                            − {formatYen(discountTotal)}
                          </td>
                        </tr>
                      </>
                    )}
                    <tr className="border-t-2 border-[var(--color-line-strong)] bg-[var(--color-cream)]">
                      <td className="wos-td font-semibold">合計</td>
                      <td className="wos-td num right font-semibold">
                        {formatYen(
                          taxableBucket +
                            shakenNonTaxBucket -
                            discountTotal,
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {enriched.length > 0 && (
            <p className="text-xs text-[var(--color-ink-light)]">
              ※ 業務カテゴリ別・税区分別はいずれも税抜の金額で、値引きを反映した「合計」がサマリーの「売上 + 前受金」と一致します。税込の請求額はサマリーの「請求合計」をご確認ください。
            </p>
          )}

          {/* 明細 */}
          <section>
            <div className="wos-sec-label mb-3">
              明細<span className="wos-ct">{enriched.length}件</span>
            </div>
            {enriched.length === 0 ? (
              <div className="wos-card text-center py-12 text-sm text-[var(--color-ink-light)]">
                この月に請求済の受注はありません。
              </div>
            ) : (
              <table className="w-full border-collapse bg-[var(--color-paper)] border border-[var(--color-line)]">
                <thead>
                  <tr className="border-b-2 border-[var(--color-line-strong)] bg-[var(--color-cream)]">
                    <th className="wos-th">請求日</th>
                    <th className="wos-th">管理番号</th>
                    <th className="wos-th">顧客名</th>
                    <th className="wos-th">作業</th>
                    <th className="wos-th">区分</th>
                    <th className="wos-th right">金額</th>
                  </tr>
                </thead>
                <tbody>
                  {enriched.map((o, i) => (
                    <tr
                      key={o.id}
                      className="border-b border-[var(--color-line)]"
                      style={{
                        background:
                          i % 2 === 1 ? "var(--color-cream)" : "transparent",
                      }}
                    >
                      <td className="wos-td num muted">
                        {formatDateOnly(o.invoiced_at)}
                      </td>
                      <td className="wos-td">
                        <Link
                          href={`/dashboard/orders/${o.id}`}
                          className="wos-serif-num hover:underline"
                        >
                          {o.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="wos-td">
                        {o.customer ? (
                          <Link
                            href={`/dashboard/customers/${o.customer.id}`}
                            className="font-semibold text-[var(--color-ink)] hover:underline"
                          >
                            {o.customer.name} 様
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="wos-td muted">{o.work_status}</td>
                      <td className="wos-td">
                        {o.isComplete ? (
                          <span className="wos-status w-k">売上</span>
                        ) : (
                          <span className="wos-status w-s">前受金</span>
                        )}
                      </td>
                      <td className="wos-td num right">{formatYen(o.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function SummaryCell({
  label,
  sub,
  value,
  accent,
  last,
}: {
  label: string;
  sub: string;
  value: number;
  accent?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className="px-6 py-5 flex flex-col gap-1.5"
      style={{
        borderRight: last ? "none" : "1px solid var(--color-line)",
      }}
    >
      <div
        className="text-xs font-medium"
        style={{
          color: accent ? "var(--color-accent)" : "var(--color-ink-mid)",
          letterSpacing: "0.12em",
        }}
      >
        {label}
      </div>
      <div className="text-xs text-[var(--color-ink-light)]">{sub}</div>
      <div
        className="wos-num-big text-2xl mt-1"
        style={{ color: accent ? "var(--color-accent)" : "var(--color-ink)" }}
      >
        {formatYen(value)}
      </div>
    </div>
  );
}
