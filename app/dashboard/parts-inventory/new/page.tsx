import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { PartCategory } from "@/lib/types";
import PartForm from "../part-form";
import { VariantEditorFields } from "../variants-section";
import { createPart } from "../actions";

export const metadata: Metadata = {
  title: "部品在庫 新規登録 | HIIRAGI",
};

export default async function NewPartPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // カテゴリ選択(大→中→小)に渡すテナントのカテゴリ一覧。
  const { data: categoriesData } = await supabase
    .from("part_categories")
    .select("*")
    .eq("user_id", user!.id)
    .order("level", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  const categories = (categoriesData ?? []) as PartCategory[];

  return (
    <>
      <div className="wos-pagehead">
        <div className="min-w-0 flex-1">
          <div className="wos-crumbs">
            <Link href="/dashboard/parts-inventory" className="hover:underline">
              部品在庫
            </Link>{" "}
            ／ 新規登録
          </div>
          <h1>部品を新規登録</h1>
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-[var(--color-cream)]">
        <div className="px-8 py-6 max-w-3xl">
          <PartForm
            action={createPart}
            categories={categories}
            submitLabel="登録する"
            cancelHref="/dashboard/parts-inventory"
          >
            <VariantEditorFields initial={[]} seedEmpty />
          </PartForm>
        </div>
      </div>
    </>
  );
}
