import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import VehicleForm from "../vehicle-form";
import { createVehicle } from "../../../actions";

export const metadata: Metadata = {
  title: "車両 新規登録 | HIIRAGI",
};

export default async function NewVehiclePage(
  props: PageProps<"/dashboard/customers/[id]/vehicles/new">,
) {
  const { id } = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: customer } = await supabase
    .from("customers")
    .select("id, name")
    .eq("id", id)
    .eq("user_id", user!.id)
    .maybeSingle();

  if (!customer) notFound();

  const action = createVehicle.bind(null, customer.id);

  return (
    <>
      <div className="mb-6">
        <Link
          href={`/dashboard/customers/${customer.id}`}
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          ← {customer.name} の詳細に戻る
        </Link>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          車両 新規登録
        </h2>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <VehicleForm
          action={action}
          submitLabel="登録する"
          cancelHref={`/dashboard/customers/${customer.id}`}
        />
      </div>
    </>
  );
}
