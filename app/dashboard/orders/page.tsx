import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { OrderListRow } from "@/lib/types";
import OrdersTable from "./orders-table";

export const metadata: Metadata = {
  title: "受注一覧 | HIIRAGI",
};

export default async function OrdersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, reception_date, work_status, estimate_status, invoice_status, invoiced_at, paid_at, payment_due_date, invoice_subject, is_archived, notes, customer:customers(id,name,name_kana), vehicle:vehicles(id,maker,model,plate_number)",
    )
    .eq("user_id", user!.id)
    .eq("is_archived", false)
    .order("id", { ascending: false });

  const orders = (data ?? []) as unknown as OrderListRow[];

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          受注一覧
        </h2>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/orders/archive"
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            アーカイブ
          </Link>
          <Link
            href="/dashboard/orders/new"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            ＋ 新規受注
          </Link>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          受注一覧の取得に失敗しました: {error.message}
        </p>
      )}

      <div className="mt-4">
        <OrdersTable rows={orders} />
      </div>
    </>
  );
}
