import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TAX_RATE, calculateTotals, calculateProfit } from "@/lib/orders/totals";
import { formatYen } from "@/lib/format";
import type {
  EstimateStatus,
  InvoiceStatus,
  OrderItem,
  WorkItemCategory,
  WorkStatus,
} from "@/lib/types";
import {
  Collapsible,
  OrderDetailTable,
  type DetailRow,
} from "./sales-interactive";

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

// 業務カテゴリ別の割合バーに使う配色（slate 系で統一）。
const BAR_COLORS = [
  "#3f5b7a",
  "#41685d",
  "#5a606c",
  "#8a8f99",
  "#243348",
  "#b3b6bc",
];

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

  // ── 数値ロジックは従来どおり（見せ方のみ変更）。total = 税抜純額（小計 − 値引き）。
  const enriched = rows.map((o) => {
    const totals = calculateTotals(o.items ?? [], o.discount_amount, 0);
    const total = Math.max(0, totals.subtotal - totals.discount);
    return {
      ...o,
      total,
      isComplete: o.work_status === "完了",
    };
  });
  const completeCount = enriched.filter((o) => o.isComplete).length;
  const advanceCount = enriched.length - completeCount;
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

  // 表示用: カテゴリ小計を課税／非課税で分離して集計（数値ロジックは不変）。
  const taxableSubByCat = new Map<string, number>();
  const nonTaxSubByCat = new Map<string, number>();
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
      const isShakenNonTax =
        it.tax_category === "shaken_non_tax" ||
        (it.tax_category == null && it.tax_free === true);
      if (isShakenNonTax) {
        shakenNonTaxBucket += sub;
        nonTaxSubByCat.set(catId, (nonTaxSubByCat.get(catId) ?? 0) + sub);
      } else {
        taxableBucket += sub;
        orderTaxableSum += sub;
        taxableSubByCat.set(catId, (taxableSubByCat.get(catId) ?? 0) + sub);
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
  // カテゴリ小計マップ → 表示順に整列した行配列（display_order 準拠＋孤児を末尾）。
  function buildCategoryRows(map: Map<string, number>): CategoryRow[] {
    const out: CategoryRow[] = [];
    const handled = new Set<string>();
    for (const c of allCategories) {
      const sub = map.get(c.id) ?? 0;
      if (sub === 0) continue;
      out.push({
        id: c.id,
        name: c.name,
        subtotal: sub,
        isDeleted: c.deleted_at !== null,
        isOrphan: false,
      });
      handled.add(c.id);
    }
    for (const [k, v] of map) {
      if (handled.has(k)) continue;
      if (v === 0) continue;
      const cat = categoryNameMap.get(k);
      out.push({
        id: k,
        name: cat?.name ?? "（カテゴリ未分類）",
        subtotal: v,
        isDeleted: cat?.deleted_at != null,
        isOrphan: !cat,
      });
    }
    return out;
  }
  const taxableCatRows = buildCategoryRows(taxableSubByCat);
  const nonTaxCatRows = buildCategoryRows(nonTaxSubByCat);

  const taxableAfterDiscount = Math.max(0, taxableBucket - discountTotal);
  const consumptionTax = Math.floor(taxableAfterDiscount * TAX_RATE);
  const taxableWithTax = taxableAfterDiscount + consumptionTax; // 課税分（税込）
  const totalWithTax = salesTotal + advanceTotal + consumptionTax; // 請求合計（税込）= 課税分（税込）＋ 非課税

  const paidTaxAfter = Math.max(0, paidTaxable - paidDiscount);
  const paidTax = Math.floor(paidTaxAfter * TAX_RATE);
  const paidWithTax = paidTaxExcl + paidTax;
  const unpaidTaxAfter = Math.max(0, unpaidTaxable - unpaidDiscount);
  const unpaidTax = Math.floor(unpaidTaxAfter * TAX_RATE);
  const unpaidWithTax = unpaidTaxExcl + unpaidTax;

  // 利益（原価後）: 構造上は算出可能。ただし原価未入力だと粗利率が無意味になるため、
  // 原価合計 > 0 のときだけ経営者向けに表示する（PDF・マイページには絶対に流さない）。
  const allItems = rows.flatMap((o) => o.items ?? []);
  const profit = calculateProfit(allItems);
  const showProfit = profit.cost > 0;

  // 課税ブロックの割合バー（課税対象＝整備＋車検整備、税抜・値引き前の小計ベース）。
  const taxableBars = taxableCatRows.map((c, i) => ({
    ...c,
    color: BAR_COLORS[i % BAR_COLORS.length],
    pct: taxableBucket > 0 ? (c.subtotal / taxableBucket) * 100 : 0,
  }));

  const detailRows: DetailRow[] = enriched.map((o) => ({
    id: o.id,
    invoiced_at: o.invoiced_at,
    customerId: o.customer?.id ?? null,
    customerName: o.customer?.name ?? null,
    workStatus: o.work_status,
    isComplete: o.isComplete,
    total: o.total,
  }));

  const prev =
    month === 1
      ? { year: year - 1, month: 12 }
      : { year, month: month - 1 };
  const next =
    month === 12
      ? { year: year + 1, month: 1 }
      : { year, month: month + 1 };

  const empty = enriched.length === 0;

  return (
    <>
      {/* 1. 月ヘッダー（前月／翌月ナビ） */}
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
        <div className="px-4 sm:px-8 pt-4">
          <p className="wos-alert warn">
            売上集計の取得に失敗しました: {error.message}
          </p>
        </div>
      )}

      <div className="flex-1 overflow-auto bg-[var(--color-cream)]">
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-8 py-6 flex flex-col gap-6">
          {empty ? (
            <div className="wos-card text-center py-16 text-sm text-[var(--color-ink-light)]">
              この月に請求済の受注はありません。
            </div>
          ) : (
            <>
              {/* 2. ヒーロー：主役は「今月の売上（税抜）」 */}
              <section className="wos-card">
                <div className="text-xs font-medium tracking-[0.12em] text-[var(--color-ink-mid)]">
                  今月の売上（税抜・課税対象）
                </div>
                <div
                  className="wos-num-big mt-1"
                  style={{ fontSize: "2.6rem", lineHeight: 1.1 }}
                >
                  {formatYen(taxableAfterDiscount)}
                </div>
                <div className="mt-1 text-xs text-[var(--color-ink-light)]">
                  整備＋車検整備・税抜（値引き後）｜ 請求 {enriched.length}件
                </div>

                {/* 回収状況チップ（税込・請求合計を入金済／未入金で分割） */}
                <div className="mt-4 flex flex-wrap gap-2">
                  <span
                    className="inline-flex items-baseline gap-2 rounded px-3 py-1.5 text-sm"
                    style={{
                      background: "rgba(65,104,93,0.10)",
                      color: "var(--color-go)",
                    }}
                  >
                    <span className="font-medium">入金済</span>
                    <span className="wos-yen">{formatYen(paidWithTax)}</span>
                    <span className="text-xs opacity-80">（{paidCount}件）</span>
                  </span>

                  {unpaidCount > 0 ? (
                    <Link
                      href="/dashboard/payments"
                      className="inline-flex items-baseline gap-2 rounded px-3 py-1.5 text-sm hover:underline"
                      style={{
                        background: "rgba(184,80,64,0.10)",
                        color: "var(--color-warn)",
                      }}
                    >
                      <span className="font-medium">未入金</span>
                      <span className="wos-yen">{formatYen(unpaidWithTax)}</span>
                      <span className="text-xs opacity-80">
                        （{unpaidCount}件 →）
                      </span>
                    </Link>
                  ) : (
                    <span
                      className="inline-flex items-baseline gap-2 rounded px-3 py-1.5 text-sm"
                      style={{
                        background: "rgba(184,80,64,0.08)",
                        color: "var(--color-warn)",
                      }}
                    >
                      <span className="font-medium">未入金</span>
                      <span className="wos-yen">{formatYen(0)}</span>
                      <span className="text-xs opacity-80">（0件）</span>
                    </span>
                  )}

                </div>

                {/* 前受金は「足し算の項」ではなく内数（未完了分のタイミング注記）として表示。 */}
                {advanceCount > 0 && (
                  <div className="mt-3 text-xs text-[var(--color-ink-light)]">
                    うち作業未完了分（前受金）
                    <span className="wos-yen mx-1 text-[var(--color-ink-soft)]">
                      {formatYen(advanceTotal)}
                    </span>
                    （税抜・{advanceCount}件）— 売上＋非課税の内数。作業完了時に売上へ振替され、請求合計に含みます。
                  </div>
                )}

                {/* 預かり（取り分ではない）。請求合計は内訳カード下段で強調表示。 */}
                <div className="mt-4 border-t border-[var(--color-line)] pt-3 text-xs text-[var(--color-ink-light)]">
                  預かり（取り分ではない）：消費税 {formatYen(consumptionTax)}・車検法定費用{" "}
                  {formatYen(shakenNonTaxBucket)}
                </div>
              </section>

              {/* 3. 売上の内訳：課税／非課税を分離して段階表示 */}
              <section className="wos-card flex flex-col gap-5">
                <div className="wos-sec-label">売上の内訳</div>

                {/* 〔課税 ― あなたの売上〕 */}
                <div>
                  <div className="mb-2 text-xs font-semibold tracking-wide text-[var(--color-ink-mid)]">
                    課税 ― あなたの売上
                  </div>

                  {taxableBucket > 0 && (
                    <div className="mb-3 flex h-3 w-full overflow-hidden rounded-full bg-[var(--color-cream)]">
                      {taxableBars.map((c) => (
                        <div
                          key={c.id}
                          title={`${c.name}: ${formatYen(c.subtotal)}`}
                          style={{ width: `${c.pct}%`, background: c.color }}
                        />
                      ))}
                    </div>
                  )}

                  <ul className="flex flex-col gap-1.5">
                    {taxableBars.map((c) => (
                      <li
                        key={c.id}
                        className="flex items-baseline justify-between gap-3 text-sm"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span
                            className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                            style={{ background: c.color }}
                          />
                          <span className="truncate">
                            {c.isDeleted || c.isOrphan
                              ? `（削除済み）${c.name}`
                              : c.name}
                          </span>
                          <span className="text-xs text-[var(--color-ink-light)]">
                            {c.pct.toFixed(0)}%
                          </span>
                        </span>
                        <span className="wos-yen shrink-0">
                          {formatYen(c.subtotal)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {/* 小計（税抜）→ 値引き ▲ → 課税対象（税抜）＝売上 → 消費税 */}
                  <dl className="mt-3 border-t border-[var(--color-line)] pt-3 flex flex-col gap-1.5 text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-[var(--color-ink-soft)]">
                        小計（税抜）
                      </dt>
                      <dd className="wos-yen">{formatYen(taxableBucket)}</dd>
                    </div>
                    {discountTotal > 0 && (
                      <div className="flex items-baseline justify-between gap-3 text-[var(--color-warn)]">
                        <dt>値引き</dt>
                        <dd className="wos-yen">▲ {formatYen(discountTotal)}</dd>
                      </div>
                    )}
                    <div className="flex items-baseline justify-between gap-3 border-t border-[var(--color-line)] pt-1.5">
                      <dt className="font-semibold">課税対象（税抜）＝売上</dt>
                      <dd className="wos-yen font-semibold text-[var(--color-accent)]">
                        {formatYen(taxableAfterDiscount)}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-[var(--color-ink-soft)]">
                        消費税（10%）
                      </dt>
                      <dd className="wos-yen">{formatYen(consumptionTax)}</dd>
                    </div>
                  </dl>
                  <p className="mt-2 text-xs text-[var(--color-ink-light)]">
                    ※ 値引きは税抜（課税対象）の段階で差し引いています。
                  </p>
                </div>

                {/* 〔非課税 ― 預かり・立替〕。金額0の月は控えめ表示。 */}
                {shakenNonTaxBucket > 0 ? (
                  <div className="border-t border-[var(--color-line)] pt-4">
                    <div className="mb-2 text-xs font-semibold tracking-wide text-[var(--color-ink-mid)]">
                      非課税 ― 預かり・立替
                    </div>
                    <dl className="flex flex-col gap-1.5 text-sm">
                      {nonTaxCatRows.map((c) => (
                        <div
                          key={c.id}
                          className="flex items-baseline justify-between gap-3"
                        >
                          <dt className="text-[var(--color-ink-soft)]">
                            {c.isDeleted || c.isOrphan
                              ? `（削除済み）${c.name}`
                              : c.name}
                          </dt>
                          <dd className="wos-yen">{formatYen(c.subtotal)}</dd>
                        </div>
                      ))}
                      <div className="flex items-baseline justify-between gap-3 border-t border-[var(--color-line)] pt-1.5">
                        <dt className="font-semibold">非課税 合計</dt>
                        <dd className="wos-yen font-semibold">
                          {formatYen(shakenNonTaxBucket)}
                        </dd>
                      </div>
                    </dl>
                    <p className="mt-2 text-xs text-[var(--color-ink-light)]">
                      ※ 車検法定費用は消費税がかからず、お客様からの預かりとしてそのまま通過します（売上には含めません）。
                    </p>
                  </div>
                ) : (
                  <div className="border-t border-[var(--color-line)] pt-3 text-xs text-[var(--color-ink-light)]">
                    非課税（車検法定費用）：今月はなし
                  </div>
                )}

                {/* 〔請求合計（税込）〕＝ 課税分（税込）＋ 非課税 */}
                <div className="border-t-2 border-[var(--color-line-strong)] pt-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold">請求合計（税込）</span>
                    <span className="wos-yen text-lg font-semibold text-[var(--color-accent)]">
                      {formatYen(totalWithTax)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-[var(--color-ink-light)]">
                    課税分（税込）{formatYen(taxableWithTax)} ＋ 非課税{" "}
                    {formatYen(shakenNonTaxBucket)}　／　{enriched.length}件
                  </div>
                </div>
              </section>

              {/* 利益（原価後）：経営者向けトグル。原価入力がある場合のみ。 */}
              {showProfit && (
                <Collapsible
                  title="利益（原価後）"
                  hint="社内のみ・PDF非表示"
                  defaultOpen={false}
                >
                  <dl className="flex flex-col gap-1.5 text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-[var(--color-ink-soft)]">
                        売上（税抜・値引き前）
                      </dt>
                      <dd className="wos-yen">{formatYen(profit.revenue)}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-[var(--color-ink-soft)]">原価</dt>
                      <dd className="wos-yen">▲ {formatYen(profit.cost)}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 border-t border-[var(--color-line)] pt-1.5">
                      <dt className="font-semibold">粗利</dt>
                      <dd className="wos-yen font-semibold text-[var(--color-accent)]">
                        {formatYen(profit.profit)}
                        <span className="ml-2 text-xs text-[var(--color-ink-light)]">
                          （{profit.profitRatePercent.toFixed(1)}%）
                        </span>
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-2 text-xs text-[var(--color-ink-light)]">
                    ※ 原価・粗利は社内管理用。顧客向けPDF／マイページには表示されません。
                  </p>
                </Collapsible>
              )}

              {/* 5. 受注明細：直近数件＋全件展開 */}
              <section className="wos-card">
                <div className="wos-sec-label mb-3">
                  受注明細<span className="wos-ct">{enriched.length}件</span>
                </div>
                <OrderDetailTable rows={detailRows} initial={8} />
              </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}
