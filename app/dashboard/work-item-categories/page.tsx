import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { WorkItemCategory } from "@/lib/types";
import WorkItemCategoriesList from "./work-item-categories-list";

export const metadata: Metadata = {
  title: "カテゴリ管理 | HIIRAGI",
};

export default async function WorkItemCategoriesPage(
  props: { searchParams: Promise<{ include_deleted?: string }> },
) {
  const sp = await props.searchParams;
  const includeDeleted = sp.include_deleted === "1";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let query = supabase
    .from("work_item_categories")
    .select("*")
    .eq("user_id", user!.id);
  if (!includeDeleted) query = query.is("deleted_at", null);
  const { data, error } = await query
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });

  const rows = (data ?? []) as WorkItemCategory[];

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            カテゴリ管理
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            業務カテゴリを管理します。標準カテゴリ「整備」「車検整備」「車検法定費用」は削除できませんが、名前は変更できます。
          </p>
        </div>
        <Link
          href="/dashboard/work-item-categories/new"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          ＋ 新規登録
        </Link>
      </div>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          カテゴリ一覧の取得に失敗しました: {error.message}
        </p>
      )}

      <div className="mt-4">
        <WorkItemCategoriesList rows={rows} includeDeleted={includeDeleted} />
      </div>
    </>
  );
}
