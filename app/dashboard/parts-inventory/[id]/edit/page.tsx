import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  PartCategory,
  PartsInventory,
  PartsInventoryVariant,
} from "@/lib/types";
import { loadPartImages } from "@/lib/parts/images-server";
import PartForm from "../../part-form";
import PartImagesSection from "../../part-images-section";
import { VariantEditorFields } from "../../variants-section";
import { updatePartAndVariants } from "../../actions";

export const metadata: Metadata = {
  title: "部品在庫 編集 | HIIRAGI",
};

export default async function EditPartPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data }, { data: variantsData }, { data: categoriesData }] =
    await Promise.all([
      supabase
        .from("parts_inventory")
        .select("*")
        .eq("id", id)
        .eq("user_id", user!.id)
        .maybeSingle(),
      supabase
        .from("parts_inventory_variants")
        .select("*")
        .eq("part_id", id)
        .eq("user_id", user!.id)
        .is("deleted_at", null)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("part_categories")
        .select("*")
        .eq("user_id", user!.id)
        .order("level", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);

  if (!data) notFound();
  const initial = data as PartsInventory;
  const variants = (variantsData ?? []) as PartsInventoryVariant[];
  const categories = (categoriesData ?? []) as PartCategory[];

  // 商品画像（署名付きURL付き）。notFound の後に取る＝存在しない部品では無駄に署名しない。
  const images = await loadPartImages(user!.id, initial.id);

  const action = updatePartAndVariants.bind(null, initial.id);

  return (
    <>
      <div className="wos-pagehead">
        <div className="min-w-0 flex-1">
          <div className="wos-crumbs">
            <Link href="/dashboard/parts-inventory" className="hover:underline">
              部品在庫
            </Link>{" "}
            ／ 編集
          </div>
          <h1>{initial.name} を編集</h1>
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-[var(--color-cream)]">
        <div className="px-4 sm:px-8 py-6 max-w-3xl space-y-6">
          {/* 画像は本体フォームの外に置く（即確定なので、下の「更新する」の一括保存には乗せない）。 */}
          <PartImagesSection
            userId={user!.id}
            partId={initial.id}
            images={images}
          />

          <PartForm
            action={action}
            initial={initial}
            categories={categories}
            submitLabel="更新する"
            cancelHref="/dashboard/parts-inventory"
          >
            <VariantEditorFields initial={variants} />
          </PartForm>
        </div>
      </div>
    </>
  );
}
