import { renderToBuffer } from "@react-pdf/renderer";
import type { NextRequest } from "next/server";
import {
  InvoiceDocument,
  type PdfDocumentType,
} from "@/lib/pdf-react/InvoiceDocument";
import { buildPdfFileName } from "@/lib/pdf/file-name";
import { getShopAssetSignedUrl, getShopInfo } from "@/lib/shop";
import { createClient } from "@/lib/supabase/server";
import type { Customer, Order, Vehicle } from "@/lib/types";

// react-pdf は Node ランタイム必須（fontkit / pdfkit）。
export const runtime = "nodejs";

// 署名 URL から画像を取得して Buffer 化。失敗時は null（fail-soft）。
async function fetchAsBuffer(url: string | null): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const typeParam = request.nextUrl.searchParams.get("type");
  const documentType: PdfDocumentType =
    typeParam === "estimate" ? "estimate" : "invoice";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { data: orderData } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!orderData) {
    return new Response("Not Found", { status: 404 });
  }
  const order = orderData as Order;

  const [{ data: customerData }, vehicleResult, shop] = await Promise.all([
    supabase
      .from("customers")
      .select("*")
      .eq("id", order.customer_id)
      .eq("user_id", user.id)
      .maybeSingle(),
    order.vehicle_id
      ? supabase
          .from("vehicles")
          .select("*")
          .eq("id", order.vehicle_id)
          .eq("user_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    getShopInfo(),
  ]);
  const customer = customerData as Customer | null;
  const vehicle = vehicleResult.data as Vehicle | null;

  const [logoUrl, stampUrl] = await Promise.all([
    getShopAssetSignedUrl(shop.logo_path),
    getShopAssetSignedUrl(shop.stamp_path),
  ]);
  const [logoBuffer, stampBuffer] = await Promise.all([
    fetchAsBuffer(logoUrl),
    fetchAsBuffer(stampUrl),
  ]);

  const buffer = await renderToBuffer(
    <InvoiceDocument
      documentType={documentType}
      order={order}
      customer={customer}
      vehicle={vehicle}
      shop={shop}
      logoBuffer={logoBuffer}
      stampBuffer={stampBuffer}
    />,
  );

  const fileName = buildPdfFileName({
    documentType,
    date:
      documentType === "invoice"
        ? (order.invoiced_at ?? new Date())
        : new Date(),
    customerName: customer?.name ?? null,
    orderNumber: order.id,
  });

  // RFC 5987: 日本語ファイル名は filename* で UTF-8 エンコード必須
  const encoded = encodeURIComponent(fileName);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`,
      "Cache-Control": "no-store",
    },
  });
}
