import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { formatYen } from "@/lib/format";
import {
  classifyPayment,
  computeOwedAmount,
  getTodayJst,
} from "@/lib/payments/classify";
import type { OrderItem } from "@/lib/types";
import PaymentsTable, { type PaymentRow } from "./payments-table";

export const metadata: Metadata = {
  title: "未回収一覧 | HIIRAGI",
};

type FetchRow = {
  id: string;
  invoiced_at: string | null;
  payment_due_date: string | null;
  items: OrderItem[] | null;
  discount_amount: number | null;
  deposit_amount: number | null;
  is_archived: boolean | null;
  customer: { id: string; name: string } | null;
};

export default async function PaymentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 未回収一覧は「請求済（=入金されていない）」のみで絞る。
  // is_archived は受注一覧（作業管理）側の軸であり、ここでは絞り込みに使わない。
  // → アーカイブ済みでも未入金なら追跡し続けたい、という運用に対応する。
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, invoiced_at, payment_due_date, items, discount_amount, deposit_amount, is_archived, customer:customers(id, name)",
    )
    .eq("user_id", user!.id)
    .eq("invoice_status", "請求済");

  const fetched = ((data ?? []) as unknown as FetchRow[]) ?? [];

  // 今日（JST）を 1 度だけ取得し、全行で同じ基準で分類する。
  const todayJst = getTodayJst();

  const enriched: PaymentRow[] = fetched.map((o) => {
    const owed = computeOwedAmount(
      o.items ?? [],
      o.discount_amount ?? 0,
      o.deposit_amount ?? 0,
    );
    const cls = classifyPayment(o.payment_due_date, todayJst);
    return {
      id: o.id,
      invoiced_at: o.invoiced_at,
      payment_due_date: o.payment_due_date,
      customer_name: o.customer?.name ?? null,
      customer_id: o.customer?.id ?? null,
      owed_amount: owed,
      status: cls.status,
      days: cls.days,
      is_archived: o.is_archived ?? false,
    };
  });

  // 振込期限の早い順（urgent から）。期限未設定は末尾。
  // 同じ期限なら invoiced_at の早い順を tiebreaker にする。
  enriched.sort((a, b) => {
    if (a.payment_due_date == null && b.payment_due_date == null) {
      return (a.invoiced_at ?? "").localeCompare(b.invoiced_at ?? "");
    }
    if (a.payment_due_date == null) return 1;
    if (b.payment_due_date == null) return -1;
    const byDue = a.payment_due_date.localeCompare(b.payment_due_date);
    if (byDue !== 0) return byDue;
    return (a.invoiced_at ?? "").localeCompare(b.invoiced_at ?? "");
  });

  // サマリー集計
  const totalCount = enriched.length;
  const totalAmount = enriched.reduce((acc, r) => acc + r.owed_amount, 0);
  const overdue = enriched.filter((r) => r.status === "overdue");
  const overdueCount = overdue.length;
  const overdueAmount = overdue.reduce((a, r) => a + r.owed_amount, 0);
  const dueSoon = enriched.filter((r) => r.status === "due_soon");
  const dueSoonCount = dueSoon.length;
  const dueSoonAmount = dueSoon.reduce((a, r) => a + r.owed_amount, 0);

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          未回収一覧
        </h2>
      </div>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        請求済（入金待ち）の受注を振込期限の早い順に表示します。お客様への請求残額（税込）と期限状況をひと目で把握できます。
      </p>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          未回収一覧の取得に失敗しました: {error.message}
        </p>
      )}

      {/* サマリー: モバイル 1 列 / sm 以上で 3 列 */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard
          label="未回収合計"
          subLabel={`${totalCount}件`}
          value={totalAmount}
          tone="zinc"
        />
        <SummaryCard
          label="期限超過"
          subLabel={overdueCount > 0 ? `${overdueCount}件` : "0件 🎉"}
          value={overdueAmount}
          tone="red"
          emphasize={overdueCount > 0}
        />
        <SummaryCard
          label="期限間近"
          subLabel={`${dueSoonCount}件（3日以内）`}
          value={dueSoonAmount}
          tone="amber"
        />
      </div>

      <PaymentsTable rows={enriched} />
    </>
  );
}

function SummaryCard({
  label,
  subLabel,
  value,
  tone,
  emphasize,
}: {
  label: string;
  subLabel: string;
  value: number;
  tone: "zinc" | "red" | "amber";
  emphasize?: boolean;
}) {
  const toneClass = {
    zinc: "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900",
    red: emphasize
      ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30"
      : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900",
    amber: "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20",
  }[tone];
  const labelTone = {
    zinc: "text-zinc-600 dark:text-zinc-400",
    red: emphasize
      ? "text-red-700 dark:text-red-300"
      : "text-zinc-600 dark:text-zinc-400",
    amber: "text-amber-700 dark:text-amber-300",
  }[tone];

  return (
    <div className={`rounded-lg border p-5 ${toneClass}`}>
      <p
        className={`text-xs font-semibold uppercase tracking-wider ${labelTone}`}
      >
        {label}
      </p>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        {subLabel}
      </p>
      <p className="mt-3 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        {formatYen(value)}
      </p>
    </div>
  );
}
