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

  // 二階建て化（2026-06-24）: 社内品番・定価は「標準（汎用＝車種空）」バリアントが持つ。
  // 一覧表示・検索用に part_id → 標準バリアントの {社内品番, 定価} を引けるようにする。
  // 先頭（display_order 最小）を代表に採る。未移行の旧行は本体 internal_code/sale_price で
  // フォールバックするので、ここに無くても表示は壊れない。
  const { data: generalVariants } = await supabase
    .from("parts_inventory_variants")
    .select("part_id, part_number, list_price, vehicle_tags, display_order")
    .eq("user_id", user!.id)
    .is("deleted_at", null)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });

  const generalByPart: Record<
    string,
    { part_number: string | null; list_price: number | null }
  > = {};
  for (const v of generalVariants ?? []) {
    const tags = (v.vehicle_tags ?? []) as string[];
    if (tags.length !== 0) continue; // 標準（車種空）のみ
    if (generalByPart[v.part_id]) continue; // 先頭を代表に
    generalByPart[v.part_id] = {
      part_number: v.part_number,
      list_price: v.list_price,
    };
  }

  return (
    <>
      <div className="wos-pagehead">
        <div className="min-w-0 flex-1">
          <div className="wos-crumbs">工房 ／ 部品在庫</div>
          <h1>部品在庫</h1>
          <div className="wos-gloss">
            部品の原価・定価・在庫数を一元管理します。発注点を切ると要発注バッジで通知します。
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

      <PartsInventoryTable
        rows={rows}
        includeDeleted={includeDeleted}
        generalByPart={generalByPart}
      />
    </>
  );
}
