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

  // include_deleted=1 のとき deleted_at IS NULL のフィルタを外す。
  let menusQuery = supabase
    .from("work_menu_items")
    .select("*")
    .eq("user_id", user!.id);
  if (!includeDeleted) menusQuery = menusQuery.is("deleted_at", null);

  const [menusRes, catsRes] = await Promise.all([
    menusQuery
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true }),
    // フィルタ表示用にアクティブな業務カテゴリ一覧を取得。
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            作業メニュー
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            よく使う作業を登録しておくと、受注明細にワンクリックで追加できます。
          </p>
        </div>
        <Link
          href="/dashboard/work-menus/new"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          ＋ 新規登録
        </Link>
      </div>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          作業メニュー一覧の取得に失敗しました: {error.message}
        </p>
      )}

      <div className="mt-4">
        <WorkMenusTable
          rows={rows}
          includeDeleted={includeDeleted}
          allCategories={allCategories}
        />
      </div>
    </>
  );
}
