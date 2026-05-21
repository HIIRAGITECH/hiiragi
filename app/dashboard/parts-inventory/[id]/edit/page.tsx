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
      <div className="mb-6">
        <Link
          href="/dashboard/parts-inventory"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          ← 部品在庫一覧に戻る
        </Link>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          部品在庫 編集
        </h2>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <PartForm
          action={action}
          initial={initial}
          submitLabel="更新する"
          cancelHref="/dashboard/parts-inventory"
        />
      </div>
    </>
  );
}
