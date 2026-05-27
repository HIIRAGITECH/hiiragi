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
      <div className="wos-pagehead">
        <div className="min-w-0 flex-1">
          <div className="wos-crumbs">工房 ／ 部品在庫</div>
          <h1>部品在庫</h1>
          <div className="wos-gloss">
            部品の原価・売価・在庫数を一元管理します。発注点を切ると要発注バッジで通知します。
          </div>
        </div>
        <div className="wos-actions">
          <Link
            href="/dashboard/parts-inventory/new"
            className="wos-btn wos-btn-sm"
          >
            ＋ 新規登録
          </Link>
        </div>
      </div>

      {error && (
        <div className="px-8 pt-4">
          <p className="wos-alert warn">
            部品在庫の取得に失敗しました: {error.message}
          </p>
        </div>
      )}

      <PartsInventoryTable rows={rows} includeDeleted={includeDeleted} />
    </>
  );
}
