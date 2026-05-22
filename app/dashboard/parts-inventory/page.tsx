import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { PartsInventory } from "@/lib/types";
import PartsInventoryTable from "./parts-inventory-table";

export const metadata: Metadata = {
  title: "部品在庫 | HIIRAGI",
};

export default async function PartsInventoryPage(props: {
  searchParams: Promise<{ include_deleted?: string }>;
}) {
  const sp = await props.searchParams;
  const includeDeleted = sp.include_deleted === "1";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let query = supabase
    .from("parts_inventory")
    .select("*")
    .eq("user_id", user!.id);
  if (!includeDeleted) query = query.is("deleted_at", null);

  const { data, error } = await query
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });

  const rows = (data ?? []) as PartsInventory[];

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            部品在庫
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            部品の原価・売価・在庫数を一元管理します。発注点を切ると🔴で通知します。
          </p>
        </div>
        <Link
          href="/dashboard/parts-inventory/new"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          ＋ 新規登録
        </Link>
      </div>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          部品在庫の取得に失敗しました: {error.message}
        </p>
      )}

      <PartsInventoryTable rows={rows} includeDeleted={includeDeleted} />
    </>
  );
}
