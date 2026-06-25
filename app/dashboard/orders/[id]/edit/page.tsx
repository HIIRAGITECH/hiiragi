import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Order } from "@/lib/types";
import OrderForm, { type CustomerOption } from "../../order-form";
import { updateOrder } from "../../actions";

export const metadata: Metadata = {
  title: "受注 編集 | HIIRAGI",
};

type CustomerWithVehicles = {
  id: string;
  name: string;
  vehicles: {
    id: string;
    plate_number: string | null;
    maker: string | null;
    model: string | null;
  }[];
};

function buildOptions(rows: CustomerWithVehicles[]): CustomerOption[] {
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    vehicles: (c.vehicles ?? []).map((v) => ({
      id: v.id,
      label:
        [v.plate_number, v.maker, v.model].filter(Boolean).join(" / ") || v.id,
    })),
  }));
}

export default async function EditOrderPage(
  props: PageProps<"/dashboard/orders/[id]/edit">,
) {
  const { id } = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: orderData }, { data: customerData }] = await Promise.all([
    supabase
      .from("orders")
      .select("*")
      .eq("id", id)
      .eq("user_id", user!.id)
      .maybeSingle(),
    supabase
      .from("customers")
      .select("id, name, vehicles(id, plate_number, maker, model)")
      .eq("user_id", user!.id)
      .order("id", { ascending: true }),
  ]);

  if (!orderData) notFound();
  const order = orderData as Order;
  const customers = buildOptions(
    (customerData ?? []) as unknown as CustomerWithVehicles[],
  );

  const action = updateOrder.bind(null, order.id);

  return (
    <>
      <div className="wos-pagehead">
        <div className="min-w-0 flex-1">
          <div className="wos-crumbs">
            <Link href="/dashboard/orders" className="hover:underline">
              受注一覧
            </Link>{" "}
            ／{" "}
            <Link
              href={`/dashboard/orders/${order.id}`}
              className="hover:underline"
            >
              No. {order.id}
            </Link>{" "}
            ／ 編集
          </div>
          <h1>受注情報を編集</h1>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[var(--color-cream)]">
        <div className="px-8 py-6 max-w-3xl">
          <OrderForm
            action={action}
            customers={customers}
            initial={order}
            defaultReceptionDate={order.reception_date}
            submitLabel="更新する"
            cancelHref={`/dashboard/orders/${order.id}`}
          />
        </div>
      </div>
    </>
  );
}
