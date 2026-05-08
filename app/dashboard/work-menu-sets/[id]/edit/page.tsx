import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { WorkMenuItem, WorkMenuSet } from "@/lib/types";
import WorkMenuSetForm from "../../work-menu-set-form";
import { updateWorkMenuSet } from "../../actions";

export const metadata: Metadata = {
  title: "作業セット 編集 | HIIRAGI",
};

export default async function EditWorkMenuSetPage(
  props: { params: Promise<{ id: string }> },
) {
  const { id } = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [setRes, linksRes, menusRes] = await Promise.all([
    supabase
      .from("work_menu_sets")
      .select("*")
      .eq("id", id)
      .eq("user_id", user!.id)
      .maybeSingle(),
    supabase
      .from("work_menu_set_items")
      .select("menu_item_id, position")
      .eq("set_id", id)
      .order("position", { ascending: true }),
    supabase
      .from("work_menu_items")
      .select("*")
      .eq("user_id", user!.id)
      .is("deleted_at", null)
      .order("display_order", { ascending: true }),
  ]);

  if (!setRes.data) notFound();
  const initial = setRes.data as WorkMenuSet;
  const initialMenuItemIds = ((linksRes.data ?? []) as {
    menu_item_id: string;
  }[]).map((l) => l.menu_item_id);
  const allMenus = (menusRes.data ?? []) as WorkMenuItem[];

  const action = updateWorkMenuSet.bind(null, initial.id);

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
          作業セット 編集
        </h2>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <WorkMenuSetForm
          action={action}
          initial={initial}
          initialMenuItemIds={initialMenuItemIds}
          allMenus={allMenus}
          submitLabel="更新する"
          cancelHref="/dashboard/work-menu-sets"
        />
      </div>
    </>
  );
}
