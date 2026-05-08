import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getShopAssetSignedUrl, getShopInfo } from "@/lib/shop";
import type { Customer, Order, Vehicle, WorkItemCategory } from "@/lib/types";
import PrintableDocument from "../printable-document";
import PrintButton from "../print-button";
import PdfButton from "../pdf-button";

export const metadata: Metadata = {
  title: "請求書 | HIIRAGI",
};

export default async function InvoicePage(
  props: PageProps<"/dashboard/orders/[id]/invoice">,
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

  const [{ data: customerData }, vehicleResult, shop, catsRes] =
    await Promise.all([
      supabase
        .from("customers")
        .select("*")
        .eq("id", order.customer_id)
        .eq("user_id", user!.id)
        .maybeSingle(),
      order.vehicle_id
        ? supabase
            .from("vehicles")
            .select("*")
            .eq("id", order.vehicle_id)
            .eq("user_id", user!.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      getShopInfo(),
      supabase
        .from("work_item_categories")
        .select("*")
        .eq("user_id", user!.id)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);
  const vehicleData = vehicleResult.data;
  const allCategories = (catsRes.data ?? []) as WorkItemCategory[];

  const [logoUrl, stampUrl] = await Promise.all([
    getShopAssetSignedUrl(shop.logo_path),
    getShopAssetSignedUrl(shop.stamp_path),
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
        <div className="flex items-center gap-2">
          <PdfButton
            documentType="invoice"
            order={order}
            customer={customerData as Customer | null}
            vehicle={vehicleData as Vehicle | null}
            shop={shop}
            logoUrl={logoUrl}
            stampUrl={stampUrl}
          />
          <PrintButton />
        </div>
      </div>

      <div id="printable-document">
        <PrintableDocument
          type="invoice"
          order={order}
          customer={customerData as Customer | null}
          vehicle={vehicleData as Vehicle | null}
          shop={shop}
          logoUrl={logoUrl}
          stampUrl={stampUrl}
          allCategories={allCategories}
        />
      </div>
    </>
  );
}
