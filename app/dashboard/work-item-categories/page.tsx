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
      <div className="wos-pagehead">
        <div className="min-w-0 flex-1">
          <div className="wos-crumbs">工房 ／ カテゴリ管理</div>
          <h1>業務カテゴリ管理</h1>
          <div className="wos-gloss">
            業務カテゴリを管理します。標準カテゴリ「整備」「車検整備」「車検法定費用」は削除できませんが、名前は変更できます。
          </div>
        </div>
        <div className="wos-actions">
          <Link
            href="/dashboard/work-item-categories/new"
            className="wos-btn wos-btn-sm"
          >
            ＋ 新規登録
          </Link>
        </div>
      </div>

      {error && (
        <div className="px-8 pt-4">
          <p className="wos-alert warn">
            カテゴリ一覧の取得に失敗しました: {error.message}
          </p>
        </div>
      )}

      <WorkItemCategoriesList rows={rows} includeDeleted={includeDeleted} />
    </>
  );
}
