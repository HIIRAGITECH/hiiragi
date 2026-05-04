import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getShopAssetSignedUrl, getShopInfo } from "@/lib/shop";
import type { Customer, Order, Vehicle } from "@/lib/types";
import PdfV2TestButton from "./pdf-v2-test-button";

// 一時的な検証ページ。Step 6 で削除予定。
export const metadata: Metadata = {
  title: "PDF v2 検証 | HIIRAGI",
};

// 型生成（PageProps）に新規ルートが反映されるまでパラメータ型を直接書く。
// 検証ページは Step 6 で削除予定なので暫定。
type PageParams = { params: Promise<{ id: string }> };

export default async function PdfV2TestPage(props: PageParams) {
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

  const [{ data: customerData }, vehicleResult, shop] = await Promise.all([
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
  ]);

  // 画像はサーバー側で signed URL だけ発行し、base64 化はクライアント側 fetch で行う。
  const [logoUrl, stampUrl] = await Promise.all([
    getShopAssetSignedUrl(shop.logo_path),
    getShopAssetSignedUrl(shop.stamp_path),
  ]);

  return (
    <div className="space-y-4 p-6">
      <div>
        <Link
          href={`/dashboard/orders/${order.id}`}
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          ← 受注詳細に戻る
        </Link>
      </div>
      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
        ⚠️ 検証用ページです（Step 6 で削除予定）。jspdf-autotable + 日本語フォント埋め込み版の出力を確認します。
      </div>
      <div className="space-y-2 text-sm">
        <div>受注ID: <code className="font-mono">{order.id}</code></div>
        <div>顧客: {(customerData as Customer | null)?.name ?? "—"}</div>
        <div>明細件数: {order.items?.length ?? 0}</div>
      </div>
      <div className="flex gap-2">
        <PdfV2TestButton
          documentType="estimate"
          order={order}
          customer={customerData as Customer | null}
          vehicle={vehicleResult.data as Vehicle | null}
          shop={shop}
          logoUrl={logoUrl}
          stampUrl={stampUrl}
        />
        <PdfV2TestButton
          documentType="invoice"
          order={order}
          customer={customerData as Customer | null}
          vehicle={vehicleResult.data as Vehicle | null}
          shop={shop}
          logoUrl={logoUrl}
          stampUrl={stampUrl}
        />
      </div>
    </div>
  );
}
