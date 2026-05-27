import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { WorkItemCategory } from "@/lib/types";
import WorkItemCategoryForm from "../../work-item-category-form";
import { updateWorkItemCategory } from "../../actions";

export const metadata: Metadata = {
  title: "カテゴリ 編集 | HIIRAGI",
};

export default async function EditWorkItemCategoryPage(
  props: { params: Promise<{ id: string }> },
) {
  const { id } = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("work_item_categories")
    .select("*")
    .eq("id", id)
    .eq("user_id", user!.id)
    .maybeSingle();

  if (!data) notFound();
  const initial = data as WorkItemCategory;

  const action = updateWorkItemCategory.bind(null, initial.id);

  return (
    <>
      <div className="wos-pagehead">
        <div className="min-w-0 flex-1">
          <div className="wos-crumbs">
            <Link
              href="/dashboard/work-item-categories"
              className="hover:underline"
            >
              カテゴリ管理
            </Link>{" "}
            ／ 編集
          </div>
          <h1>{initial.name} を編集</h1>
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-[var(--color-cream)]">
        <div className="px-8 py-6 max-w-xl">
          <WorkItemCategoryForm
            action={action}
            initial={initial}
            submitLabel="更新する"
            cancelHref="/dashboard/work-item-categories"
          />
        </div>
      </div>
    </>
  );
}
