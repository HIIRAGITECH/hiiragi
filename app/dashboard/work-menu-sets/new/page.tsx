import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { WorkMenuItem } from "@/lib/types";
import WorkMenuSetForm from "../work-menu-set-form";
import { createWorkMenuSet } from "../actions";

export const metadata: Metadata = {
  title: "作業セット 新規登録 | HIIRAGI",
};

export default async function NewWorkMenuSetPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("work_menu_items")
    .select("*")
    .eq("user_id", user!.id)
    .order("display_order", { ascending: true });
  const allMenus = (data ?? []) as WorkMenuItem[];

  return (
    <>
      <div className="mb-6">
        <Link
          href="/dashboard/work-menu-sets"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          ← 作業セット一覧に戻る
        </Link>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          作業セット 新規登録
        </h2>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <WorkMenuSetForm
          action={createWorkMenuSet}
          initialMenuItemIds={[]}
          allMenus={allMenus}
          submitLabel="登録する"
          cancelHref="/dashboard/work-menu-sets"
        />
      </div>
    </>
  );
}
