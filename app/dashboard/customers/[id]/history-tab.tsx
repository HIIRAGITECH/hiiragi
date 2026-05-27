import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type {
  EstimateStatus,
  OrderItem,
  WorkStatus,
} from "@/lib/types";
import { calculateTotals } from "@/lib/orders/totals";
import { formatDate, formatYen } from "@/lib/format";
import {
  EstimateStatusBadge,
  WorkStatusBadge,
} from "../../orders/status-badge";

type HistoryRow = {
  id: string;
  reception_date: string;
  work_status: WorkStatus;
  estimate_status: EstimateStatus;
  items: OrderItem[];
  discount_amount: number;
  vehicle: {
    id: string;
    model: string | null;
    plate_number: string | null;
  } | null;
};

function summarizeItems(items: OrderItem[]): string {
  if (!items || items.length === 0) return "—";
  if (items.length === 1) return items[0].work_name;
  return `${items[0].work_name} 他${items.length - 1}件`;
}

export default async function HistoryTab({
  customerId,
  userId,
}: {
  customerId: string;
  userId: string;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, reception_date, work_status, estimate_status, items, discount_amount, vehicle:vehicles(id, model, plate_number)",
    )
    .eq("customer_id", customerId)
    .eq("user_id", userId)
    .order("reception_date", { ascending: false })
    .order("id", { ascending: false });

  const orders = (data ?? []) as unknown as HistoryRow[];

  return (
    <section>
      <div className="wos-sec-label mb-3">
        整備履歴<span className="wos-ct">{orders.length}件</span>
      </div>

      {error && (
        <p className="wos-alert warn mb-3">
          整備履歴の取得に失敗しました: {error.message}
        </p>
      )}

      {orders.length === 0 ? (
        <div className="wos-card text-center py-10 text-sm text-[var(--color-ink-light)]">
          この顧客の整備履歴はまだありません。
        </div>
      ) : (
        <table className="w-full border-collapse bg-[var(--color-paper)] border border-[var(--color-line)]">
          <thead>
            <tr className="border-b-2 border-[var(--color-line-strong)] bg-[var(--color-cream)]">
              <th className="wos-th">管理番号</th>
              <th className="wos-th">受付日</th>
              <th className="wos-th">車種</th>
              <th className="wos-th">作業内容</th>
              <th className="wos-th right">合計金額</th>
              <th className="wos-th">作業</th>
              <th className="wos-th">見積</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const totals = calculateTotals(
                o.items ?? [],
                o.discount_amount,
                0,
              );
              return (
                <tr
                  key={o.id}
                  className="border-b border-[var(--color-line)] hover:bg-[var(--color-cream)]"
                >
                  <td className="wos-td">
                    <Link
                      href={`/dashboard/orders/${o.id}`}
                      className="wos-serif-num hover:underline"
                    >
                      {o.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="wos-td num">{formatDate(o.reception_date)}</td>
                  <td className="wos-td muted">
                    {o.vehicle?.model ?? o.vehicle?.plate_number ?? "—"}
                  </td>
                  <td className="wos-td">{summarizeItems(o.items ?? [])}</td>
                  <td className="wos-td num right">{formatYen(totals.total)}</td>
                  <td className="wos-td">
                    <WorkStatusBadge value={o.work_status} />
                  </td>
                  <td className="wos-td">
                    <EstimateStatusBadge
                      value={o.estimate_status}
                      orderId={o.id}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
