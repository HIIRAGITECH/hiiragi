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

  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, invoiced_at, payment_due_date, items, discount_amount, deposit_amount, is_archived, customer:customers(id, name)",
    )
    .eq("user_id", user!.id)
    .eq("invoice_status", "請求済");

  const fetched = ((data ?? []) as unknown as FetchRow[]) ?? [];
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
      <div className="wos-pagehead">
        <div className="min-w-0 flex-1">
          <div className="wos-crumbs">会計 ／ 入金管理</div>
          <h1>未回収一覧</h1>
          <div className="wos-gloss">
            請求済（入金待ち）の受注を振込期限の早い順に表示します。
          </div>
        </div>
      </div>

      {error && (
        <div className="px-4 sm:px-8 pt-4">
          <p className="wos-alert warn">
            未回収一覧の取得に失敗しました: {error.message}
          </p>
        </div>
      )}

      {/* サマリー 3連 */}
      <div className="grid grid-cols-1 md:grid-cols-3 border-b border-[var(--color-line)] bg-[var(--color-paper)]">
        <SummaryCell
          label="未回収合計"
          subLabel={`${totalCount}件`}
          value={totalAmount}
        />
        <SummaryCell
          label="期限超過"
          subLabel={overdueCount > 0 ? `${overdueCount}件` : "0件"}
          value={overdueAmount}
          warn={overdueCount > 0}
        />
        <SummaryCell
          label="期限間近"
          subLabel={`${dueSoonCount}件（3日以内）`}
          value={dueSoonAmount}
          last
        />
      </div>

      <PaymentsTable rows={enriched} />
    </>
  );
}

function SummaryCell({
  label,
  subLabel,
  value,
  warn,
  last,
}: {
  label: string;
  subLabel: string;
  value: number;
  warn?: boolean;
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
          color: warn ? "var(--color-warn)" : "var(--color-ink-mid)",
          letterSpacing: "0.12em",
        }}
      >
        {label}
      </div>
      <div className="text-xs text-[var(--color-ink-light)]">{subLabel}</div>
      <div
        className="wos-num-big text-2xl mt-1"
        style={{ color: warn ? "var(--color-warn)" : "var(--color-ink)" }}
      >
        {formatYen(value)}
      </div>
    </div>
  );
}
