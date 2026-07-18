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
      <div className="wos-pagehead">
        <div className="min-w-0 flex-1">
          <div className="wos-crumbs">
            <Link href="/dashboard/customers" className="hover:underline">
              顧客管理
            </Link>{" "}
            ／{" "}
            <Link
              href={`/dashboard/customers/${customer.id}`}
              className="hover:underline"
            >
              {customer.name}
            </Link>{" "}
            ／ 車両編集
          </div>
          <h1>{vehicle.plate_number ?? "車両"} を編集</h1>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[var(--color-cream)]">
        <div className="px-4 sm:px-8 py-6 max-w-3xl">
          <VehicleForm
            action={action}
            initial={vehicle}
            submitLabel="更新する"
            cancelHref={`/dashboard/customers/${customer.id}`}
          />
        </div>
      </div>
    </>
  );
}
