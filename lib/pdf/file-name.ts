export function sanitizeFileName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "") return "unknown";
  const replaced = trimmed.replace(/[\\/:*?"<>|]/g, "_");
  const collapsed = replaced.replace(/\s+/g, " ").replace(/_+/g, "_");
  const final = collapsed.trim();
  return final === "" ? "unknown" : final;
}

function toYyyymmdd(date: Date | string | null | undefined): string {
  const d =
    date instanceof Date
      ? date
      : typeof date === "string" && date !== ""
        ? new Date(date)
        : new Date();
  const safe = Number.isNaN(d.getTime()) ? new Date() : d;
  const y = safe.getFullYear().toString().padStart(4, "0");
  const m = (safe.getMonth() + 1).toString().padStart(2, "0");
  const day = safe.getDate().toString().padStart(2, "0");
  return `${y}${m}${day}`;
}

export type PdfDocType = "estimate" | "invoice" | "delivery" | "receipt";

const DOC_TYPE_LABELS: Record<PdfDocType, string> = {
  estimate: "見積書",
  invoice: "請求書",
  delivery: "納品書",
  receipt: "領収書",
};

export function buildPdfFileName(params: {
  // 単一種別なら種別ラベル、複数種別をまとめた結合 PDF なら "帳票" を使う。
  documentType: PdfDocType | "combined";
  date: Date | string | null;
  customerName: string | null;
  orderNumber: string | null;
}): string {
  const typeLabel =
    params.documentType === "combined"
      ? "帳票"
      : DOC_TYPE_LABELS[params.documentType];
  const dateStr = toYyyymmdd(params.date);
  const rawCustomer =
    params.customerName && params.customerName.trim() !== ""
      ? params.customerName.trim()
      : "顧客名未設定";
  const customerWithHonorific = rawCustomer.endsWith("様")
    ? rawCustomer
    : `${rawCustomer}様`;
  const customer = sanitizeFileName(customerWithHonorific);
  const orderNo = sanitizeFileName(
    params.orderNumber && params.orderNumber.trim() !== ""
      ? params.orderNumber
      : "NO-NUMBER",
  );
  return `${typeLabel}_${dateStr}_${customer}_${orderNo}.pdf`;
}
