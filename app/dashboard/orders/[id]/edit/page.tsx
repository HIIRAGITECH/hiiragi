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
      <div className="mb-6">
        <Link
          href="/dashboard/orders"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          ← 受注一覧に戻る
        </Link>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          受注 編集（{order.id}）
        </h2>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <OrderForm
          action={action}
          customers={customers}
          initial={order}
          defaultReceptionDate={order.reception_date}
          submitLabel="更新する"
          cancelHref="/dashboard/orders"
        />
      </div>
    </>
  );
}
