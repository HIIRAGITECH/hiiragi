import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { PartsInventory } from "@/lib/types";
import PartForm from "../../part-form";
import { updatePart } from "../../actions";

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

  const { data } = await supabase
    .from("parts_inventory")
    .select("*")
    .eq("id", id)
    .eq("user_id", user!.id)
    .maybeSingle();

  if (!data) notFound();
  const initial = data as PartsInventory;

  const action = updatePart.bind(null, initial.id);

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
        <div className="px-8 py-6 max-w-3xl">
          <PartForm
            action={action}
            initial={initial}
            submitLabel="更新する"
            cancelHref="/dashboard/parts-inventory"
          />
        </div>
      </div>
    </>
  );
}
