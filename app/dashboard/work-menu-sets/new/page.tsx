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
    .is("deleted_at", null)
    .order("display_order", { ascending: true });
  const allMenus = (data ?? []) as WorkMenuItem[];

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
        <div className="px-8 py-6 max-w-3xl">
          <WorkMenuSetForm
            action={createWorkMenuSet}
            initialMenuItemIds={[]}
            allMenus={allMenus}
            submitLabel="登録する"
            cancelHref="/dashboard/work-menu-sets"
          />
        </div>
      </div>
    </>
  );
}
