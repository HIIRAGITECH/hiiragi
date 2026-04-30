import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { OrderListRow } from "@/lib/types";
import ArchiveTable from "./archive-table";

export const metadata: Metadata = {
  title: "アーカイブ受注 | HIIRAGI",
};

export default async function ArchivePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, reception_date, work_status, estimate_status, invoice_status, invoiced_at, paid_at, is_archived, notes, customer:customers(id,name,name_kana), vehicle:vehicles(id,maker,model,plate_number)",
    )
    .eq("user_id", user!.id)
    .eq("is_archived", true)
    .order("id", { ascending: false });

  const orders = (data ?? []) as unknown as OrderListRow[];

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          アーカイブ受注
        </h2>
        <Link
          href="/dashboard/orders"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          ← 受注一覧へ戻る
        </Link>
      </div>

      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        アーカイブ済みの受注は通常の一覧から除外されます。復元すれば再び一覧に戻ります。
      </p>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          アーカイブ一覧の取得に失敗しました: {error.message}
        </p>
      )}

      <div className="mt-4">
        <ArchiveTable rows={orders} />
      </div>
    </>
  );
}
