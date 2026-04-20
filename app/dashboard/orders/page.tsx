import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import DeleteButton from "@/lib/components/delete-button";
import type { OrderListRow } from "@/lib/types";
import { deleteOrder } from "./actions";
import { EstimateStatusBadge, WorkStatusBadge } from "./status-badge";

export const metadata: Metadata = {
  title: "受注一覧 | HIIRAGI",
};

function formatDate(s: string): string {
  return s.replace(/-/g, "/");
}

export default async function OrdersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, reception_date, work_status, estimate_status, customer:customers(id,name), vehicle:vehicles(id,model,plate_number)",
    )
    .eq("user_id", user!.id)
    .order("id", { ascending: false });

  const orders = (data ?? []) as unknown as OrderListRow[];

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            受注一覧
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            登録件数: {orders.length} 件
          </p>
        </div>
        <Link
          href="/dashboard/orders/new"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          ＋ 新規受注
        </Link>
      </div>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          受注一覧の取得に失敗しました: {error.message}
        </p>
      )}

      <div className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        {orders.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
            受注が登録されていません。
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wider text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-medium">管理番号</th>
                <th className="px-4 py-3 font-medium">顧客名</th>
                <th className="px-4 py-3 font-medium">車種</th>
                <th className="px-4 py-3 font-medium">受付日</th>
                <th className="px-4 py-3 font-medium">作業</th>
                <th className="px-4 py-3 font-medium">見積</th>
                <th className="px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {orders.map((o) => (
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
                    {o.vehicle?.model ?? o.vehicle?.plate_number ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {formatDate(o.reception_date)}
                  </td>
                  <td className="px-4 py-3">
                    <WorkStatusBadge value={o.work_status} />
                  </td>
                  <td className="px-4 py-3">
                    <EstimateStatusBadge value={o.estimate_status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-2">
                      <Link
                        href={`/dashboard/orders/${o.id}/edit`}
                        className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        編集
                      </Link>
                      <DeleteButton
                        action={deleteOrder}
                        hidden={{ id: o.id }}
                        confirmMessage={`受注「${o.id}」を削除します。よろしいですか？`}
                        label="削除"
                        className="rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs text-red-700 transition-colors hover:bg-red-50 dark:border-red-900 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950/30"
                      />
                    </div>
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
