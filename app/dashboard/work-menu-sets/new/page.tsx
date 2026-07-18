import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { PartsInventory, WorkMenuItem } from "@/lib/types";
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

  const [menusRes, partsRes] = await Promise.all([
    supabase
      .from("work_menu_items")
      .select("*")
      .eq("user_id", user!.id)
      .is("deleted_at", null)
      .order("display_order", { ascending: true }),
    // 明細に出せるアクティブ部品のみ（間接材料 show_in_detail=false は除外）。受注ピッカーと同条件。
    supabase
      .from("parts_inventory")
      .select("*")
      .eq("user_id", user!.id)
      .is("deleted_at", null)
      .eq("show_in_detail", true)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);
  const allMenus = (menusRes.data ?? []) as WorkMenuItem[];
  const allParts = (partsRes.data ?? []) as PartsInventory[];

  return (
    <>
      <div className="wos-pagehead">
        <div className="min-w-0 flex-1">
          <div className="wos-crumbs">
            <Link href="/dashboard/work-menu-sets" className="hover:underline">
              作業セット
            </Link>{" "}
            ／ 新規登録
          </div>
          <h1>作業セットを新規登録</h1>
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-[var(--color-cream)]">
        <div className="px-4 sm:px-8 py-6 max-w-3xl">
          <WorkMenuSetForm
            action={createWorkMenuSet}
            initialMenuItemIds={[]}
            initialParts={[]}
            allMenus={allMenus}
            allParts={allParts}
            submitLabel="登録する"
            cancelHref="/dashboard/work-menu-sets"
          />
        </div>
      </div>
    </>
  );
}
