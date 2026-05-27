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
      <div className="wos-pagehead">
        <div className="min-w-0 flex-1">
          <div className="wos-crumbs">
            <Link href="/dashboard/work-menu-sets" className="hover:underline">
              作業セット
            </Link>{" "}
            ／ 編集
          </div>
          <h1>{initial.name} を編集</h1>
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-[var(--color-cream)]">
        <div className="px-8 py-6 max-w-3xl">
          <WorkMenuSetForm
            action={action}
            initial={initial}
            initialMenuItemIds={initialMenuItemIds}
            allMenus={allMenus}
            submitLabel="更新する"
            cancelHref="/dashboard/work-menu-sets"
          />
        </div>
      </div>
    </>
  );
}
