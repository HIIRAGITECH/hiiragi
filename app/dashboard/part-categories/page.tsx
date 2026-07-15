import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { PartCategory } from "@/lib/types";
import PartCategoriesManager from "./part-categories-manager";

export const metadata: Metadata = {
  title: "部品カテゴリ | HIIRAGI",
};

// 部品カテゴリ 段階1: テナントが大／中／小(最大3階層)を作成・編集・削除・並べ替えする管理画面。
// 作業カテゴリ(/dashboard/work-item-categories)とは別導線・別テーブル。段階1では部品への紐付けは無し。
export default async function PartCategoriesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("part_categories")
    .select("*")
    .eq("user_id", user!.id)
    .order("level", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const rows = (data ?? []) as PartCategory[];

  return (
    <>
      <div className="wos-pagehead">
        <div className="min-w-0 flex-1">
          <div className="wos-crumbs">工房 ／ 部品カテゴリ</div>
          <h1>部品カテゴリ管理</h1>
          <div className="wos-gloss">
            部品在庫を分類するカテゴリを、大・中・小の最大3階層まで自由に作成できます。中・小は任意で、1階層だけでも使えます。分類の軸（部位・メーカー・種類など）は自由です。
          </div>
        </div>
      </div>

      {error && (
        <div className="px-8 pt-4">
          <p className="wos-alert warn">
            部品カテゴリの取得に失敗しました: {error.message}
          </p>
        </div>
      )}

      <PartCategoriesManager rows={rows} />
    </>
  );
}
