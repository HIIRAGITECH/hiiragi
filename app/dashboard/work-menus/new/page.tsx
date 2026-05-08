import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { WorkItemCategory } from "@/lib/types";
import WorkMenuForm from "../work-menu-form";
import { createWorkMenu } from "../actions";

export const metadata: Metadata = {
  title: "作業メニュー 新規登録 | HIIRAGI",
};

export default async function NewWorkMenuPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // アクティブな業務カテゴリのみ選択肢に出す。
  const { data } = await supabase
    .from("work_item_categories")
    .select("*")
    .eq("user_id", user!.id)
    .is("deleted_at", null)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });
  const allCategories = (data ?? []) as WorkItemCategory[];

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
          作業メニュー 新規登録
        </h2>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <WorkMenuForm
          action={createWorkMenu}
          allCategories={allCategories}
          submitLabel="登録する"
          cancelHref="/dashboard/work-menus"
        />
      </div>
    </>
  );
}
