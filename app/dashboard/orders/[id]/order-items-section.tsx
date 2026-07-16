import { createClient } from "@/lib/supabase/server";
import type {
  Customer,
  IndirectMaterialEntry,
  Order,
  PartsInventory,
  PartsInventoryVariant,
  Vehicle,
  WorkItemCategory,
  WorkMenuItem,
  WorkMenuSet,
} from "@/lib/types";
import { createOrderPhotoFolder, updateOrderItems } from "../actions";
import ItemsForm from "./items-form";

// 受注ページ高速化 その2: 明細ピッカー用の「重いカタログ」(部品/メニュー/セット/variants/間接材/カテゴリ)を
// 取得して ItemsForm に供給する async サーバーコンポーネント。受注詳細ページ側で <Suspense> に包むことで、
// カタログ取得がステータス連動の軽いシェル(ステータスバー・顧客/車両・帳票メタ)の描画をブロックしないようにする。
//
// 重要（在庫の確実さ最優先）:
//   ここは「明細ピッカーに使うマスターの供給」だけを担う。ItemsForm 内部・保存・明細計算・在庫バナー・
//   在庫RPC・ステータス遷移のロジックは一切変更しない。受注行由来の値(initialItems・reservedAt/consumedAt 等)は
//   親から渡された order をそのまま ItemsForm へ流す（在庫の表示/結果は従来どおり）。
export default async function OrderItemsSection({
  userId,
  order,
  vehicle,
  customer,
  googleConnected,
}: {
  userId: string;
  order: Order;
  vehicle: Vehicle | null;
  customer: Customer | null;
  googleConnected: boolean;
}) {
  const supabase = await createClient();

  const [
    menusRes,
    setsRes,
    setItemsRes,
    setPartsRes,
    catsRes,
    allPartsRes,
    indirectRes,
    variantsRes,
  ] = await Promise.all([
    supabase
      .from("work_menu_items")
      .select("*")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("work_menu_sets")
      .select("*")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("work_menu_set_items")
      .select("set_id, menu_item_id, position")
      .order("position", { ascending: true }),
    // 作業セットに含まれる部品（案2）。展開時にその受注の車種で価格解決する。
    supabase
      .from("work_menu_set_parts")
      .select("set_id, part_id, quantity, position")
      .order("position", { ascending: true }),
    supabase
      .from("work_item_categories")
      .select("*")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true }),
    // parts_inventory 全件を1回取得し、原価マップ（全部品）とピッカー一覧（アクティブ＋明細表示可）を JS で導出。
    supabase.from("parts_inventory").select("*").eq("user_id", userId),
    supabase
      .from("work_menu_indirect_materials")
      .select("menu_item_id, part_id, quantity"),
    // Step 3-2b: 車種別定価ピッカー用の variant 一覧（全アクティブ・display_order 順）。
    supabase
      .from("parts_inventory_variants")
      .select("*")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  const allMenus = (menusRes.data ?? []) as WorkMenuItem[];
  const allSets = (setsRes.data ?? []) as WorkMenuSet[];
  const allSetItems = (setItemsRes.data ?? []) as {
    set_id: string;
    menu_item_id: string;
    position: number;
  }[];
  const allSetParts = (setPartsRes.data ?? []) as {
    set_id: string;
    part_id: string;
    quantity: number;
    position: number;
  }[];
  const allCategories = (catsRes.data ?? []) as WorkItemCategory[];

  // ピッカーは従来の DB フィルタ／並び（deleted_at IS NULL・show_in_detail・display_order→created_at）を JS で再現。
  const allPartsRows = (allPartsRes.data ?? []) as PartsInventory[];
  const allParts = allPartsRows
    .filter((p) => p.deleted_at === null && p.show_in_detail === true)
    .sort(
      (a, b) =>
        a.display_order - b.display_order ||
        a.created_at.localeCompare(b.created_at),
    );
  const allVariants = (variantsRes.data ?? []) as PartsInventoryVariant[];

  const partsCostMap = new Map<string, number>();
  for (const p of allPartsRows) {
    partsCostMap.set(p.id, Number(p.cost_price ?? 0));
  }
  const indirectByMenu: Record<string, IndirectMaterialEntry[]> = {};
  for (const e of (indirectRes.data ?? []) as {
    menu_item_id: string;
    part_id: string;
    quantity: number;
  }[]) {
    const mid = e.menu_item_id;
    if (!indirectByMenu[mid]) indirectByMenu[mid] = [];
    indirectByMenu[mid].push({
      part_id: e.part_id,
      quantity: Number(e.quantity ?? 0),
      cost_price: partsCostMap.get(e.part_id) ?? 0,
    });
  }

  const menuMap = new Map(allMenus.map((m) => [m.id, m]));
  const partMap = new Map(allParts.map((p) => [p.id, p]));
  const allSetsWithItems = allSets.map((s) => ({
    set: s,
    items: allSetItems
      .filter((l) => l.set_id === s.id)
      .map((l) => {
        const menu = menuMap.get(l.menu_item_id);
        return menu ? { menu, position: l.position } : null;
      })
      .filter((x): x is { menu: WorkMenuItem; position: number } => !!x)
      .sort((a, b) => a.position - b.position),
    // 部品は allParts（アクティブ・明細表示可）に無い（＝ソフト削除/非表示）ものは
    // メニュー同様スキップする。価格は展開時に items-form 側で車種解決する。
    parts: allSetParts
      .filter((l) => l.set_id === s.id)
      .map((l) => {
        const part = partMap.get(l.part_id);
        return part
          ? { part, quantity: Number(l.quantity ?? 1), position: l.position }
          : null;
      })
      .filter(
        (
          x,
        ): x is { part: PartsInventory; quantity: number; position: number } =>
          !!x,
      )
      .sort((a, b) => a.position - b.position),
  }));

  const itemsAction = updateOrderItems.bind(null, order.id);
  const createFolderAction = createOrderPhotoFolder.bind(null, order.id);

  return (
    <ItemsForm
      action={itemsAction}
      initialItems={order.items ?? []}
      initialDiscount={order.discount_amount}
      initialDeposit={order.deposit_amount}
      initialEstimateNotes={order.estimate_notes}
      initialInvoiceNotes={order.invoice_notes}
      initialPhotoFolderUrl={order.photo_folder_url}
      googleConnected={googleConnected}
      initialDriveFolderId={order.drive_folder_id}
      createFolderAction={createFolderAction}
      allMenus={allMenus}
      allSetsWithItems={allSetsWithItems}
      allCategories={allCategories}
      allParts={allParts}
      allVariants={allVariants}
      vehicle={vehicle}
      customer={customer}
      reservedAt={order.reserved_at}
      consumedAt={order.consumed_at}
      indirectByMenu={indirectByMenu}
    />
  );
}
