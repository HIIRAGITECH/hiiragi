import { renderToBuffer } from "@react-pdf/renderer";
import type { NextRequest } from "next/server";
import { PDFDocument } from "pdf-lib";
import {
  InvoiceDocument,
  type PdfDocumentType,
} from "@/lib/pdf-react/InvoiceDocument";
import { buildPdfFileName } from "@/lib/pdf/file-name";
import { getShopAssetSignedUrl, getShopInfo } from "@/lib/shop";
import { createClient } from "@/lib/supabase/server";
import type {
  Customer,
  Order,
  Vehicle,
  WorkItemCategory,
} from "@/lib/types";

// react-pdf は Node ランタイム必須（fontkit / pdfkit）。
export const runtime = "nodejs";

// 帳票の出力順（自然な並び）。複数選択時はこの順に結合する。
const TYPE_ORDER: PdfDocumentType[] = [
  "estimate",
  "delivery",
  "invoice",
  "receipt",
];
const VALID_TYPES = new Set<string>(TYPE_ORDER);

// クエリから出力対象の帳票種別リストを決める。
//   - 新方式: ?types=estimate,delivery,invoice,receipt（カンマ区切り・複数）
//   - 旧方式（後方互換）: ?type=estimate | invoice（単一）
// 重複は除去し、TYPE_ORDER の順に正規化する。1件も無ければ invoice にフォールバック。
function resolveTypes(request: NextRequest): PdfDocumentType[] {
  const typesParam = request.nextUrl.searchParams.get("types");
  if (typesParam) {
    const requested = new Set(
      typesParam
        .split(",")
        .map((s) => s.trim())
        .filter((s) => VALID_TYPES.has(s)),
    );
    const ordered = TYPE_ORDER.filter((t) => requested.has(t));
    if (ordered.length > 0) return ordered;
  }
  // 旧 ?type= は estimate のみ特別扱い、その他は invoice（従来挙動を完全維持）。
  const single = request.nextUrl.searchParams.get("type");
  return [single === "estimate" ? "estimate" : "invoice"];
}

// 複数の PDF バイナリを 1 ファイルに結合する。
// 各 type を個別に renderToBuffer しているため、ページ番号や継続ヘッダは
// 帳票ごとに正しく算出される（単一 Document 内で複数 Page を並べる方式だと
// react-pdf の pageNumber が全体通し番号になり継続ヘッダが誤表示されるため、
// バイナリ結合を採用）。
async function mergePdfs(buffers: Buffer[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create();
  for (const buf of buffers) {
    const src = await PDFDocument.load(buf);
    const pages = await merged.copyPages(src, src.getPageIndices());
    for (const p of pages) merged.addPage(p);
  }
  return merged.save();
}

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
  const types = resolveTypes(request);
  const receiptNote =
    request.nextUrl.searchParams.get("receiptNote") ?? undefined;

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

  const [{ data: customerData }, vehicleResult, shop, catsRes] =
    await Promise.all([
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
      // 業務カテゴリ: 削除済み含む全件（過去明細が削除済みカテゴリを参照していても表示できるように）
      supabase
        .from("work_item_categories")
        .select("*")
        .eq("user_id", user.id)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);
  const customer = customerData as Customer | null;
  const vehicle = vehicleResult.data as Vehicle | null;
  const allCategories = (catsRes.data ?? []) as WorkItemCategory[];

  const [logoUrl, stampUrl] = await Promise.all([
    getShopAssetSignedUrl(shop.logo_path),
    getShopAssetSignedUrl(shop.stamp_path),
  ]);
  const [logoBuffer, stampBuffer] = await Promise.all([
    fetchAsBuffer(logoUrl),
    fetchAsBuffer(stampUrl),
  ]);

  // 選択された各帳票を個別にレンダリングし、複数あれば 1 ファイルに結合する。
  const buffers = await Promise.all(
    types.map((documentType) =>
      renderToBuffer(
        <InvoiceDocument
          documentType={documentType}
          order={order}
          customer={customer}
          vehicle={vehicle}
          shop={shop}
          logoBuffer={logoBuffer}
          stampBuffer={stampBuffer}
          allCategories={allCategories}
          receiptNote={receiptNote}
        />,
      ),
    ),
  );

  const output: Buffer =
    buffers.length === 1
      ? buffers[0]
      : Buffer.from(await mergePdfs(buffers));

  // ファイル名: 単一種別はその帳票名、複数結合は「帳票」。
  // 日付は請求書を含む場合は請求日（invoiced_at）を優先、無ければ当日。
  const single = types.length === 1 ? types[0] : null;
  const fileName = buildPdfFileName({
    documentType: single ?? "combined",
    date:
      types.includes("invoice") && order.invoiced_at
        ? order.invoiced_at
        : new Date(),
    customerName: customer?.name ?? null,
    orderNumber: order.id,
  });

  // RFC 5987: 日本語ファイル名は filename* で UTF-8 エンコード必須
  const encoded = encodeURIComponent(fileName);

  return new Response(new Uint8Array(output), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`,
      "Cache-Control": "no-store",
    },
  });
}
