import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { WorkItemCategory, WorkMenuItem } from "@/lib/types";
import WorkMenusTable from "./work-menus-table";

export const metadata: Metadata = {
  title: "作業メニュー | HIIRAGI",
};

export default async function WorkMenusPage(
  props: { searchParams: Promise<{ include_deleted?: string }> },
) {
  const sp = await props.searchParams;
  const includeDeleted = sp.include_deleted === "1";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let menusQuery = supabase
    .from("work_menu_items")
    .select("*")
    .eq("user_id", user!.id);
  if (!includeDeleted) menusQuery = menusQuery.is("deleted_at", null);

  const [menusRes, catsRes] = await Promise.all([
    menusQuery
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("work_item_categories")
      .select("*")
      .eq("user_id", user!.id)
      .is("deleted_at", null)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);
  const error = menusRes.error;

  const rows = (menusRes.data ?? []) as WorkMenuItem[];
  const allCategories = (catsRes.data ?? []) as WorkItemCategory[];

  return (
    <>
      <div className="wos-pagehead">
        <div className="min-w-0 flex-1">
          <div className="wos-crumbs">工房 ／ 作業メニュー</div>
          <h1>作業メニュー</h1>
          <div className="wos-gloss">
            よく使う作業を登録しておくと、受注明細にワンクリックで追加できます。
          </div>
        </div>
        <div className="wos-actions">
          <Link href="/dashboard/work-menus/new" className="wos-btn wos-btn-sm">
            ＋ 新規登録
          </Link>
        </div>
      </div>

      {error && (
        <div className="px-4 sm:px-8 pt-4">
          <p className="wos-alert warn">
            作業メニュー一覧の取得に失敗しました: {error.message}
          </p>
        </div>
      )}

      <WorkMenusTable
        rows={rows}
        includeDeleted={includeDeleted}
        allCategories={allCategories}
      />
    </>
  );
}
