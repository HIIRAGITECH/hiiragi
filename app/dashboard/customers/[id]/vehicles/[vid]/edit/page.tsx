import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Vehicle } from "@/lib/types";
import VehicleForm from "../../vehicle-form";
import { updateVehicle } from "../../../../actions";

export const metadata: Metadata = {
  title: "車両 編集 | HIIRAGI",
};

export default async function EditVehiclePage(
  props: PageProps<"/dashboard/customers/[id]/vehicles/[vid]/edit">,
) {
  const { id, vid } = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: customer }, { data: vehicleData }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name")
      .eq("id", id)
      .eq("user_id", user!.id)
      .maybeSingle(),
    supabase
      .from("vehicles")
      .select("*")
      .eq("id", vid)
      .eq("customer_id", id)
      .eq("user_id", user!.id)
      .maybeSingle(),
  ]);

  if (!customer || !vehicleData) notFound();
  const vehicle = vehicleData as Vehicle;

  const action = updateVehicle.bind(null, customer.id, vehicle.id);

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
          車両 編集（{vehicle.id}）
        </h2>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <VehicleForm
          action={action}
          initial={vehicle}
          submitLabel="更新する"
          cancelHref={`/dashboard/customers/${customer.id}`}
        />
      </div>
    </>
  );
}
