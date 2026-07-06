import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type {
  PartsInventory,
  PartsInventoryVariant,
  WorkMenuItem,
  WorkMenuSet,
} from "@/lib/types";
import WorkMenuSetsList from "./work-menu-sets-list";

export const metadata: Metadata = {
  title: "作業セット | HIIRAGI",
};

type SetItemRow = {
  set_id: string;
  menu_item_id: string;
  position: number;
};

type SetPartRow = {
  set_id: string;
  part_id: string;
  quantity: number;
  position: number;
};

export default async function WorkMenuSetsPage(
  props: { searchParams: Promise<{ include_deleted?: string }> },
) {
  const sp = await props.searchParams;
  const includeDeleted = sp.include_deleted === "1";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // セットは include_deleted=1 のとき非表示も含める。
  // メニュー側は常にアクティブのみ取得する（削除済みメニューはセット表示でグレーアウトすべきだが
  // 4-5 のセットモーダル仕様に合わせ、まず一覧では除外する）。
  let setsQuery = supabase
    .from("work_menu_sets")
    .select("*")
    .eq("user_id", user!.id);
  if (!includeDeleted) setsQuery = setsQuery.is("deleted_at", null);

  const [setsRes, linksRes, menusRes, partLinksRes, partsRes, variantsRes] =
    await Promise.all([
      setsQuery
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("work_menu_set_items")
        .select("set_id, menu_item_id, position")
        .order("position", { ascending: true }),
      supabase
        .from("work_menu_items")
        .select("*")
        .eq("user_id", user!.id)
        .is("deleted_at", null),
      // 案2: セットに含まれる部品。表示のみ（金額は固定保存しない）。
      supabase
        .from("work_menu_set_parts")
        .select("set_id, part_id, quantity, position")
        .order("position", { ascending: true }),
      // 部品名・売価。名称は削除済みでも出したいので deleted_at で絞らない。
      supabase
        .from("parts_inventory")
        .select("id, name, sale_price")
        .eq("user_id", user!.id),
      // 汎用参考価格の解決用 variant（アクティブのみ、display_order 昇順）。
      supabase
        .from("parts_inventory_variants")
        .select("id, part_id, list_price, vehicle_tags, display_order")
        .eq("user_id", user!.id)
        .is("deleted_at", null)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);

  const sets = (setsRes.data ?? []) as WorkMenuSet[];
  const links = (linksRes.data ?? []) as SetItemRow[];
  const menus = (menusRes.data ?? []) as WorkMenuItem[];
  const menuMap = new Map(menus.map((m) => [m.id, m]));

  const partLinks = (partLinksRes.data ?? []) as SetPartRow[];
  const parts = (partsRes.data ?? []) as Pick<
    PartsInventory,
    "id" | "name" | "sale_price"
  >[];
  const partMap = new Map(parts.map((p) => [p.id, p]));
  const variants = (variantsRes.data ?? []) as Pick<
    PartsInventoryVariant,
    "id" | "part_id" | "list_price" | "vehicle_tags" | "display_order"
  >[];

  // 汎用（車種指定なし＝vehicle_tags 空）の代表 variant を part ごとに1件だけ採用する。
  // 受注展開の effectiveByPart の「汎用側（generalByPart）」と同じ選び方（display_order 先頭）。
  const genericVariantByPart = new Map<string, (typeof variants)[number]>();
  for (const v of variants) {
    if (v.vehicle_tags.length !== 0) continue; // 車種タグありは汎用ではない
    if (genericVariantByPart.has(v.part_id)) continue; // 先頭（display_order 最小）
    genericVariantByPart.set(v.part_id, v);
  }

  // 部品の参考単価 = 汎用 variant の定価(list_price) ?? 部品の sale_price ?? null（不明）。
  // rowFromPart の個人向け（掛け率なし）と同じ基準＝「汎用の定価」。受注では車種で再解決される。
  function refUnitPriceOf(partId: string): number | null {
    const gv = genericVariantByPart.get(partId);
    if (gv && gv.list_price != null) return gv.list_price;
    const p = partMap.get(partId);
    if (p && p.sale_price != null) return p.sale_price;
    return null;
  }

  const rows = sets.map((s) => ({
    ...s,
    items: links
      .filter((l) => l.set_id === s.id)
      .map((l) => {
        const menu = menuMap.get(l.menu_item_id);
        return menu ? { menu, position: l.position } : null;
      })
      .filter((x): x is { menu: WorkMenuItem; position: number } => !!x)
      .sort((a, b) => a.position - b.position),
    parts: partLinks
      .filter((l) => l.set_id === s.id)
      .sort((a, b) => a.position - b.position)
      .map((l) => {
        const p = partMap.get(l.part_id);
        return {
          partId: l.part_id,
          name: p?.name ?? "（削除された部品）",
          quantity: Number(l.quantity ?? 1),
          position: l.position,
          refUnitPrice: refUnitPriceOf(l.part_id),
        };
      }),
  }));

  return (
    <>
      <div className="wos-pagehead">
        <div className="min-w-0 flex-1">
          <div className="wos-crumbs">工房 ／ 作業セット</div>
          <h1>作業セット</h1>
          <div className="wos-gloss">
            よく使う作業の組み合わせをセットで登録しておくと、受注明細にまとめて追加できます。
          </div>
        </div>
        <div className="wos-actions">
          <Link
            href="/dashboard/work-menu-sets/new"
            className="wos-btn wos-btn-sm"
          >
            ＋ 新規登録
          </Link>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[var(--color-cream)]">
        <div className="px-8 py-6">
          <WorkMenuSetsList rows={rows} includeDeleted={includeDeleted} />
        </div>
      </div>
    </>
  );
}
