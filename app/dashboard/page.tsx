import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatYen } from "@/lib/format";
import { salesMonthOrFilter } from "@/lib/sales/filter";
import { calculateTotals } from "@/lib/orders/totals";
import {
  classifyPayment,
  computeOwedAmount,
  getTodayJst,
} from "@/lib/payments/classify";
import type { OrderItem, Subscription } from "@/lib/types";

const PLAN_LABEL: Record<string, string> = {
  free: "Free",
  paid: "Paid",
  trial: "Trial",
  special_free: "Special Free",
};

export const metadata: Metadata = {
  title: "ダッシュボード | HIIRAGI",
};

type DashboardData = {
  inProgress: number;
  inProgressDelta: string;
  estimatePending: number;
  estimatePendingOldest: number; // 日数（最古の入庫からの経過）
  unpaidCount: number;
  unpaidAmount: number;
  overdueCount: number;
  monthSales: number;
  monthSalesPrev: number;
  partsAlert: number;
  unpaidRows: UnpaidRow[];
  todoRows: TodoRow[];
};

type UnpaidRow = {
  id: string;
  customer_name: string | null;
  customer_id: string | null;
  amount: number;
  due_date: string | null;
  overdue: boolean;
};

type TodoRow = {
  id: string;
  kind: "overdue" | "estimate" | "delivery";
  label: string;
  customer: string;
  detail: string;
  href: string;
  warn: boolean;
};

function jpDate(d: Date): string {
  const days = ["日", "月", "火", "水", "木", "金", "土"];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${days[d.getDay()]}曜日）`;
}

async function loadDashboard(): Promise<DashboardData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const empty: DashboardData = {
    inProgress: 0,
    inProgressDelta: "—",
    estimatePending: 0,
    estimatePendingOldest: 0,
    unpaidCount: 0,
    unpaidAmount: 0,
    overdueCount: 0,
    monthSales: 0,
    monthSalesPrev: 0,
    partsAlert: 0,
    unpaidRows: [],
    todoRows: [],
  };
  if (!user) return empty;

  const todayJst = getTodayJst();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const pad2 = (n: number) => n.toString().padStart(2, "0");
  const startThis = `${year}-${pad2(month)}-01T00:00:00+09:00`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const endThis = `${nextYear}-${pad2(nextMonth)}-01T00:00:00+09:00`;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const startPrev = `${prevYear}-${pad2(prevMonth)}-01T00:00:00+09:00`;
  // 売上計上月（sales_month）を優先した対象月判定（売上集計ページと同じ流儀）。
  const monthFirstThis = `${year}-${pad2(month)}-01`;
  const monthFirstPrev = `${prevYear}-${pad2(prevMonth)}-01`;

  const [
    inProgressRes,
    estimatePendingRes,
    unpaidRes,
    salesThisRes,
    salesPrevRes,
    partsRes,
  ] = await Promise.all([
    // 作業中
    supabase
      .from("orders")
      .select("id, reception_date", { count: "exact" })
      .eq("user_id", user.id)
      .eq("is_archived", false)
      .eq("work_status", "作業中"),
    // 見積発行待ち（未作成 + 発行済 で「了承待ち」を含めず、未作成のみカウント）
    supabase
      .from("orders")
      .select("id, reception_date")
      .eq("user_id", user.id)
      .eq("is_archived", false)
      .in("estimate_status", ["未作成"]),
    // 未回収（請求済かつ未入金）
    supabase
      .from("orders")
      .select(
        "id, payment_due_date, items, discount_amount, deposit_amount, customer:customers(id, name)",
      )
      .eq("user_id", user.id)
      .eq("invoice_status", "請求済"),
    // 今月売上（請求済 + 入金済）。売上計上月優先・未設定は invoiced_at の月で判定。
    supabase
      .from("orders")
      .select("items, discount_amount, deposit_amount")
      .eq("user_id", user.id)
      .in("invoice_status", ["請求済", "入金済"])
      .or(salesMonthOrFilter(monthFirstThis, startThis, endThis)),
    // 前月売上
    supabase
      .from("orders")
      .select("items, discount_amount, deposit_amount")
      .eq("user_id", user.id)
      .in("invoice_status", ["請求済", "入金済"])
      .or(salesMonthOrFilter(monthFirstPrev, startPrev, startThis)),
    // 在庫アラート
    supabase
      .from("parts_inventory")
      .select("id, name, stock_quantity, reorder_point")
      .eq("user_id", user.id)
      .is("deleted_at", null),
  ]);

  // 未回収
  type UnpaidRecord = {
    id: string;
    payment_due_date: string | null;
    items: OrderItem[] | null;
    discount_amount: number | null;
    deposit_amount: number | null;
    customer: { id: string; name: string } | null;
  };
  const unpaidData = (unpaidRes.data ?? []) as unknown as UnpaidRecord[];
  let unpaidCount = 0;
  let unpaidAmount = 0;
  let overdueCount = 0;
  const unpaidRows: UnpaidRow[] = [];
  for (const r of unpaidData) {
    const owed = computeOwedAmount(
      r.items ?? [],
      r.discount_amount ?? 0,
      r.deposit_amount ?? 0,
    );
    unpaidCount += 1;
    unpaidAmount += owed;
    const cls = classifyPayment(r.payment_due_date, todayJst);
    if (cls.status === "overdue") overdueCount += 1;
    unpaidRows.push({
      id: r.id,
      customer_name: r.customer?.name ?? null,
      customer_id: r.customer?.id ?? null,
      amount: owed,
      due_date: r.payment_due_date,
      overdue: cls.status === "overdue",
    });
  }
  // 期限超過を優先、次に金額が大きい順に並べる
  unpaidRows.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    return b.amount - a.amount;
  });

  // 今月売上 / 前月売上
  function sumSales(
    rows:
      | {
          items: OrderItem[] | null;
          discount_amount: number | null;
          deposit_amount: number | null;
        }[]
      | null,
  ): number {
    if (!rows) return 0;
    let s = 0;
    for (const r of rows) {
      const t = calculateTotals(
        r.items ?? [],
        r.discount_amount ?? 0,
        r.deposit_amount ?? 0,
      );
      s += t.total;
    }
    return s;
  }
  const monthSales = sumSales(
    (salesThisRes.data ?? []) as unknown as {
      items: OrderItem[] | null;
      discount_amount: number | null;
      deposit_amount: number | null;
    }[],
  );
  const monthSalesPrev = sumSales(
    (salesPrevRes.data ?? []) as unknown as {
      items: OrderItem[] | null;
      discount_amount: number | null;
      deposit_amount: number | null;
    }[],
  );

  // 在庫アラート
  const partsData =
    (partsRes.data ?? []) as {
      id: string;
      name: string;
      stock_quantity: number;
      reorder_point: number;
    }[];
  const partsAlert = partsData.filter(
    (p) => Number(p.stock_quantity) <= Number(p.reorder_point),
  ).length;

  // 見積発行待ちの最古日数
  const estimatePendingData =
    (estimatePendingRes.data ?? []) as { id: string; reception_date: string }[];
  let estimatePendingOldest = 0;
  for (const r of estimatePendingData) {
    const recv = new Date(`${r.reception_date}T00:00:00+09:00`).getTime();
    const today = new Date(`${todayJst}T00:00:00+09:00`).getTime();
    const days = Math.max(
      0,
      Math.round((today - recv) / (1000 * 60 * 60 * 24)),
    );
    if (days > estimatePendingOldest) estimatePendingOldest = days;
  }

  // 要対応リスト
  const todoRows: TodoRow[] = [];
  for (const u of unpaidRows.filter((r) => r.overdue).slice(0, 3)) {
    const days = u.due_date
      ? Math.max(
          0,
          Math.round(
            (new Date(`${todayJst}T00:00:00+09:00`).getTime() -
              new Date(`${u.due_date}T00:00:00+09:00`).getTime()) /
              (1000 * 60 * 60 * 24),
          ),
        )
      : 0;
    todoRows.push({
      id: u.id,
      kind: "overdue",
      label: "期限超過",
      customer: u.customer_name ? `${u.customer_name} 様` : u.id,
      detail: `請求 ${formatYen(u.amount)} ／ 振込期限 ${u.due_date ?? "—"}（${days}日経過）`,
      href: `/dashboard/orders/${u.id}`,
      warn: true,
    });
  }
  for (const e of estimatePendingData
    .slice()
    .sort((a, b) => a.reception_date.localeCompare(b.reception_date))
    .slice(0, 3)) {
    const recv = new Date(`${e.reception_date}T00:00:00+09:00`).getTime();
    const today = new Date(`${todayJst}T00:00:00+09:00`).getTime();
    const days = Math.max(
      0,
      Math.round((today - recv) / (1000 * 60 * 60 * 24)),
    );
    todoRows.push({
      id: e.id,
      kind: "estimate",
      label: "見積未作成",
      customer: e.id,
      detail: `入庫から ${days}日経過`,
      href: `/dashboard/orders/${e.id}`,
      warn: false,
    });
  }

  return {
    inProgress: inProgressRes.count ?? 0,
    inProgressDelta: `登録 ${inProgressRes.count ?? 0}件`,
    estimatePending: estimatePendingData.length,
    estimatePendingOldest,
    unpaidCount,
    unpaidAmount,
    overdueCount,
    monthSales,
    monthSalesPrev,
    partsAlert,
    unpaidRows: unpaidRows.slice(0, 8),
    todoRows: todoRows.slice(0, 6),
  };
}

async function loadSubscription(): Promise<Subscription | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  return (data as Subscription | null) ?? null;
}

export default async function DashboardPage() {
  const [data, sub] = await Promise.all([loadDashboard(), loadSubscription()]);
  const today = new Date();
  const mypageOn = sub?.options?.mypage === true;
  const planLabel = sub ? (PLAN_LABEL[sub.plan] ?? sub.plan) : "—";
  const planStatusOk = sub?.status === "active";

  const salesDelta = (() => {
    if (data.monthSalesPrev === 0) {
      return data.monthSales > 0 ? "前月実績なし" : "前月実績なし";
    }
    const ratio =
      ((data.monthSales - data.monthSalesPrev) / data.monthSalesPrev) * 100;
    const sign = ratio >= 0 ? "+" : "";
    return `前月比 ${sign}${ratio.toFixed(0)}%`;
  })();

  const kpis: {
    n: string;
    jp: string;
    delta: string;
    warn?: boolean;
  }[] = [
    {
      n: `${data.inProgress} 件`,
      jp: "作業中",
      delta: data.inProgressDelta,
    },
    {
      n: `${data.estimatePending} 件`,
      jp: "見積発行待ち",
      delta:
        data.estimatePending > 0
          ? `最古 ${data.estimatePendingOldest}日`
          : "なし",
    },
    {
      n: `${data.unpaidCount} 件`,
      jp: "未回収",
      delta: formatYen(data.unpaidAmount),
    },
    {
      n: `${data.overdueCount} 件`,
      jp: "期限超過",
      delta: data.overdueCount > 0 ? "要連絡" : "なし",
      warn: data.overdueCount > 0,
    },
    {
      n: formatYen(data.monthSales),
      jp: "今月売上",
      delta: salesDelta,
    },
    {
      n: `${data.partsAlert} 件`,
      jp: "在庫アラート",
      delta: data.partsAlert > 0 ? "要発注" : "問題なし",
      warn: data.partsAlert > 0,
    },
  ];

  return (
    <>
      {/* ヘッダー */}
      <div className="wos-pagehead">
        <div className="min-w-0 flex-1">
          <div className="wos-crumbs">{jpDate(today)}</div>
          <h1>
            本日の作業 — 作業中 {data.inProgress}件
          </h1>
        </div>
        <div className="wos-actions">
          <Link
            href="/dashboard/billing"
            className="flex flex-col items-end gap-0.5 border border-[var(--color-line)] px-3 py-1.5 hover:border-[var(--color-line-strong)] no-underline"
          >
            <span className="text-[10px] tracking-widest text-[var(--color-ink-light)]">
              プラン
            </span>
            <span className="flex items-center gap-2 text-xs font-medium">
              <span>{planLabel}</span>
              <span
                className="inline-block border px-1.5 py-0.5 text-[10px]"
                style={{
                  borderColor: planStatusOk
                    ? "var(--color-go)"
                    : "var(--color-warn)",
                  color: planStatusOk
                    ? "var(--color-go)"
                    : "var(--color-warn)",
                }}
              >
                {planStatusOk ? "稼働中" : "停止"}
              </span>
              {mypageOn && (
                <span className="inline-block border border-[var(--color-line-strong)] px-1.5 py-0.5 text-[10px] text-[var(--color-ink-mid)]">
                  マイページ
                </span>
              )}
            </span>
          </Link>
          <Link href="/dashboard/sales" className="wos-btn-ghost wos-btn-sm">
            売上集計
          </Link>
          <Link href="/dashboard/orders/new" className="wos-btn wos-btn-sm">
            ＋ 新規受注を作成
          </Link>
        </div>
      </div>

      {/* KPI 6連 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 border-b border-[var(--color-line)] bg-[var(--color-paper)]">
        {kpis.map((k, i) => (
          <div
            key={k.jp}
            className="px-5 py-4 flex flex-col gap-1"
            style={{
              borderRight:
                i < kpis.length - 1
                  ? "1px solid var(--color-line)"
                  : "none",
            }}
          >
            <div
              className="text-xs font-medium text-[var(--color-ink-mid)]"
              style={{ letterSpacing: "0.08em" }}
            >
              {k.jp}
            </div>
            <div
              className="wos-num-big text-2xl mt-1"
              style={{
                color: k.warn ? "var(--color-warn)" : "var(--color-ink)",
              }}
            >
              {k.n}
            </div>
            <div
              className="text-xs font-medium"
              style={{
                color: k.warn ? "var(--color-warn)" : "var(--color-ink-light)",
              }}
            >
              {k.delta}
            </div>
          </div>
        ))}
      </div>

      {/* 2ペイン: 要対応 / 未回収 */}
      <div className="flex-1 overflow-auto bg-[var(--color-cream)]">
        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-8 px-4 sm:px-8 py-6 min-h-full">
          {/* 要対応 */}
          <div className="min-w-0 flex flex-col gap-3">
            <div className="wos-sec-label">
              要対応の受注
              <span className="wos-ct">{data.todoRows.length}件</span>
            </div>
            <div>
              {data.todoRows.length === 0 ? (
                <div className="py-8 text-center text-sm text-[var(--color-ink-light)] border-t border-[var(--color-line)]">
                  対応中のタスクはありません。
                </div>
              ) : (
                data.todoRows.map((t) => (
                  <Link
                    key={`${t.kind}-${t.id}`}
                    href={t.href}
                    className="grid grid-cols-[110px_1fr_auto] gap-4 py-3.5 items-center border-b border-[var(--color-line)] hover:bg-[var(--color-paper)] -mx-2 px-2"
                  >
                    <span
                      className="text-xs font-semibold"
                      style={{
                        color: t.warn
                          ? "var(--color-warn)"
                          : "var(--color-accent)",
                        letterSpacing: "0.14em",
                      }}
                    >
                      {t.label}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-[var(--color-ink)]">
                        {t.customer}
                      </div>
                      <div className="text-xs text-[var(--color-ink-mid)] mt-0.5">
                        {t.detail}
                      </div>
                    </div>
                    <span className="text-[var(--color-accent)]">→</span>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* 未回収 */}
          <div className="flex flex-col gap-3 min-w-0">
            <div className="wos-sec-label">
              未回収
              <span className="wos-ct">{formatYen(data.unpaidAmount)}</span>
            </div>
            <div>
              {data.unpaidRows.length === 0 ? (
                <div className="py-8 text-center text-sm text-[var(--color-ink-light)] border-t border-[var(--color-line)]">
                  現在、未回収はありません 🎉
                </div>
              ) : (
                data.unpaidRows.map((u) => (
                  <Link
                    key={u.id}
                    href={`/dashboard/orders/${u.id}`}
                    className="grid grid-cols-[1fr_auto] gap-4 py-3 items-baseline border-b border-[var(--color-line)] hover:bg-[var(--color-paper)] -mx-2 px-2"
                  >
                    <div>
                      <div className="text-sm font-medium text-[var(--color-ink)]">
                        {u.customer_name ? `${u.customer_name} 様` : u.id}
                      </div>
                      <div className="text-xs text-[var(--color-ink-mid)] mt-0.5">
                        期限 {u.due_date ?? "—"}
                        {u.overdue && (
                          <span className="text-[var(--color-warn)] font-semibold ml-2">
                            期限超過
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="wos-yen text-base font-medium">
                      {formatYen(u.amount)}
                    </span>
                  </Link>
                ))
              )}
              {data.unpaidRows.length > 0 && (
                <Link
                  href="/dashboard/payments"
                  className="block text-center py-3 text-xs text-[var(--color-accent)] font-medium hover:underline mt-2"
                >
                  すべての未回収を見る →
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
