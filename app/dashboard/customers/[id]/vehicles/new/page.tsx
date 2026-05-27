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
            ／ 車両を追加
          </div>
          <h1>車両を新規登録</h1>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[var(--color-cream)]">
        <div className="px-8 py-6 max-w-3xl">
          <VehicleForm
            action={action}
            submitLabel="登録する"
            cancelHref={`/dashboard/customers/${customer.id}`}
          />
        </div>
      </div>
    </>
  );
}
