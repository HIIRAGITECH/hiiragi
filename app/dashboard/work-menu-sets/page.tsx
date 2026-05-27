import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { WorkMenuItem, WorkMenuSet } from "@/lib/types";
import WorkMenuSetsList from "./work-menu-sets-list";

export const metadata: Metadata = {
  title: "作業セット | HIIRAGI",
};

type SetItemRow = {
  set_id: string;
  menu_item_id: string;
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

  const [setsRes, linksRes, menusRes] = await Promise.all([
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
  ]);

  const sets = (setsRes.data ?? []) as WorkMenuSet[];
  const links = (linksRes.data ?? []) as SetItemRow[];
  const menus = (menusRes.data ?? []) as WorkMenuItem[];
  const menuMap = new Map(menus.map((m) => [m.id, m]));

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
