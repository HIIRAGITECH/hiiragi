import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getShopInfo } from "@/lib/shop";
import type { Customer, Order, Vehicle } from "@/lib/types";
import PrintableDocument from "../printable-document";
import PrintButton from "../print-button";

export const metadata: Metadata = {
  title: "見積書 | HIIRAGI",
};

export default async function EstimatePage(
  props: PageProps<"/dashboard/orders/[id]/estimate">,
) {
  const { id } = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: orderData } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .eq("user_id", user!.id)
    .maybeSingle();

  if (!orderData) notFound();
  const order = orderData as Order;

  const [{ data: customerData }, { data: vehicleData }, shop] = await Promise.all([
    supabase
      .from("customers")
      .select("*")
      .eq("id", order.customer_id)
      .eq("user_id", user!.id)
      .maybeSingle(),
    supabase
      .from("vehicles")
      .select("*")
      .eq("id", order.vehicle_id)
      .eq("user_id", user!.id)
      .maybeSingle(),
    getShopInfo(),
  ]);

  return (
    <>
      <div className="no-print mb-4 flex items-center justify-between">
        <Link
          href={`/dashboard/orders/${order.id}`}
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          ← 受注詳細に戻る
        </Link>
        <PrintButton />
      </div>

      <PrintableDocument
        type="estimate"
        order={order}
        customer={customerData as Customer | null}
        vehicle={vehicleData as Vehicle | null}
        shop={shop}
      />
    </>
  );
}
