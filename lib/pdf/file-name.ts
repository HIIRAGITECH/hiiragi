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

export function buildPdfFileName(params: {
  documentType: "estimate" | "invoice";
  date: Date | string | null;
  customerName: string | null;
  orderNumber: string | null;
}): string {
  const typeLabel = params.documentType === "estimate" ? "見積書" : "請求書";
  const dateStr = toYyyymmdd(params.date);
  const customer = sanitizeFileName(
    params.customerName && params.customerName.trim() !== ""
      ? params.customerName
      : "顧客名未設定",
  );
  const orderNo = sanitizeFileName(
    params.orderNumber && params.orderNumber.trim() !== ""
      ? params.orderNumber
      : "NO-NUMBER",
  );
  return `${typeLabel}_${dateStr}_${customer}_${orderNo}.pdf`;
}
