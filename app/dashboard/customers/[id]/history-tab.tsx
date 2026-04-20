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
  if (items.length === 1) return items[0].name;
  return `${items[0].name} 他${items.length - 1}件`;
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
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          整備履歴（{orders.length} 件）
        </h3>
      </div>

      {error && (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          整備履歴の取得に失敗しました: {error.message}
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        {orders.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
            この顧客の整備履歴はまだありません。
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wider text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-medium">管理番号</th>
                <th className="px-4 py-3 font-medium">受付日</th>
                <th className="px-4 py-3 font-medium">車種</th>
                <th className="px-4 py-3 font-medium">作業内容</th>
                <th className="px-4 py-3 text-right font-medium">合計金額</th>
                <th className="px-4 py-3 font-medium">作業</th>
                <th className="px-4 py-3 font-medium">見積</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {orders.map((o) => {
                const totals = calculateTotals(
                  o.items ?? [],
                  o.discount_amount,
                  0,
                );
                return (
                  <tr
                    key={o.id}
                    className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-zinc-900 dark:text-zinc-50">
                      <Link
                        href={`/dashboard/orders/${o.id}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {o.id}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {formatDate(o.reception_date)}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {o.vehicle?.model ?? o.vehicle?.plate_number ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {summarizeItems(o.items ?? [])}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-zinc-900 dark:text-zinc-50">
                      {formatYen(totals.total)}
                    </td>
                    <td className="px-4 py-3">
                      <WorkStatusBadge value={o.work_status} />
                    </td>
                    <td className="px-4 py-3">
                      <EstimateStatusBadge value={o.estimate_status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
