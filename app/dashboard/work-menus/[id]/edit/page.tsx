import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  PartsInventory,
  WorkItemCategory,
  WorkMenuItem,
} from "@/lib/types";
import WorkMenuForm from "../../work-menu-form";
import { updateWorkMenu } from "../../actions";

export const metadata: Metadata = {
  title: "作業メニュー 編集 | HIIRAGI",
};

export default async function EditWorkMenuPage(
  props: { params: Promise<{ id: string }> },
) {
  const { id } = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [menuRes, catsRes, partsRes] = await Promise.all([
    supabase
      .from("work_menu_items")
      .select("*")
      .eq("id", id)
      .eq("user_id", user!.id)
      .maybeSingle(),
    supabase
      .from("work_item_categories")
      .select("*")
      .eq("user_id", user!.id)
      .is("deleted_at", null)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("parts_inventory")
      .select("*")
      .eq("user_id", user!.id)
      .is("deleted_at", null)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (!menuRes.data) notFound();
  const initial = menuRes.data as WorkMenuItem;
  let allCategories = (catsRes.data ?? []) as WorkItemCategory[];
  let allParts = (partsRes.data ?? []) as PartsInventory[];

  // 編集対象の linked_part_id が非表示部品 / 別所有を指す場合に備えて、対象行を別途取得して
  // フォームの選択肢に合流させる（select の初期値が消えると意図せぬ手入力扱いになるため）。
  if (
    initial.linked_part_id &&
    !allParts.some((p) => p.id === initial.linked_part_id)
  ) {
    const { data: orphanPart } = await supabase
      .from("parts_inventory")
      .select("*")
      .eq("id", initial.linked_part_id)
      .eq("user_id", user!.id)
      .maybeSingle();
    if (orphanPart) {
      allParts = [...allParts, orphanPart as PartsInventory];
    }
  }

  // 編集対象の item_category_id がアクティブ一覧に無い（=削除済みカテゴリ）場合に
  // セレクトの選択肢から外れて初期値が変わってしまうのを防ぐ。
  if (
    initial.item_category_id &&
    !allCategories.some((c) => c.id === initial.item_category_id)
  ) {
    const { data: orphan } = await supabase
      .from("work_item_categories")
      .select("*")
      .eq("id", initial.item_category_id)
      .eq("user_id", user!.id)
      .maybeSingle();
    if (orphan) {
      allCategories = [...allCategories, orphan as WorkItemCategory];
    }
  }

  const action = updateWorkMenu.bind(null, initial.id);

  return (
    <>
      <div className="mb-6">
        <Link
          href="/dashboard/work-menus"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          ← 作業メニュー一覧に戻る
        </Link>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          作業メニュー 編集
        </h2>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <WorkMenuForm
          action={action}
          initial={initial}
          allCategories={allCategories}
          allParts={allParts}
          submitLabel="更新する"
          cancelHref="/dashboard/work-menus"
        />
      </div>
    </>
  );
}
