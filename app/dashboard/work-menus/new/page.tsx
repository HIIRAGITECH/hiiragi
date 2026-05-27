import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { PartsInventory, WorkItemCategory } from "@/lib/types";
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

  // アクティブな業務カテゴリ + アクティブな部品マスターを取得。
  const [catsRes, partsRes] = await Promise.all([
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
  const allCategories = (catsRes.data ?? []) as WorkItemCategory[];
  const allParts = (partsRes.data ?? []) as PartsInventory[];

  return (
    <>
      <div className="wos-pagehead">
        <div className="min-w-0 flex-1">
          <div className="wos-crumbs">
            <Link href="/dashboard/work-menus" className="hover:underline">
              作業メニュー
            </Link>{" "}
            ／ 新規登録
          </div>
          <h1>作業メニューを新規登録</h1>
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-[var(--color-cream)]">
        <div className="px-8 py-6 max-w-3xl">
          <WorkMenuForm
            action={createWorkMenu}
            allCategories={allCategories}
            allParts={allParts}
            submitLabel="登録する"
            cancelHref="/dashboard/work-menus"
          />
        </div>
      </div>
    </>
  );
}
