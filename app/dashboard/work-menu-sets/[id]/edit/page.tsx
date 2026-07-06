import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { PartsInventory, WorkMenuItem, WorkMenuSet } from "@/lib/types";
import WorkMenuSetForm, { type SetPartRow } from "../../work-menu-set-form";
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

  const [setRes, linksRes, partLinksRes, menusRes, partsRes] =
    await Promise.all([
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
        .from("work_menu_set_parts")
        .select("part_id, quantity, position")
        .eq("set_id", id)
        .order("position", { ascending: true }),
      supabase
        .from("work_menu_items")
        .select("*")
        .eq("user_id", user!.id)
        .is("deleted_at", null)
        .order("display_order", { ascending: true }),
      supabase
        .from("parts_inventory")
        .select("*")
        .eq("user_id", user!.id)
        .is("deleted_at", null)
        .eq("show_in_detail", true)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);

  if (!setRes.data) notFound();
  const initial = setRes.data as WorkMenuSet;
  const initialMenuItemIds = ((linksRes.data ?? []) as {
    menu_item_id: string;
  }[]).map((l) => l.menu_item_id);
  const initialParts = ((partLinksRes.data ?? []) as {
    part_id: string;
    quantity: number;
  }[]).map((l): SetPartRow => ({ part_id: l.part_id, quantity: l.quantity }));
  const allMenus = (menusRes.data ?? []) as WorkMenuItem[];
  const allParts = (partsRes.data ?? []) as PartsInventory[];

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
            initialParts={initialParts}
            allMenus={allMenus}
            allParts={allParts}
            submitLabel="更新する"
            cancelHref="/dashboard/work-menu-sets"
          />
        </div>
      </div>
    </>
  );
}
