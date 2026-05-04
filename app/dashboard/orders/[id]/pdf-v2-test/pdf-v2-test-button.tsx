"use client";

import { useState } from "react";
import type {
  Customer,
  Order,
  ShopInfo,
  Vehicle,
} from "@/lib/types";
import { buildPdfFileName } from "@/lib/pdf/file-name";
import type { PdfDocumentType } from "@/lib/pdf/v2";

interface Props {
  documentType: PdfDocumentType;
  order: Order;
  customer: Customer | null;
  vehicle: Vehicle | null;
  shop: ShopInfo;
  logoUrl: string | null;
  stampUrl: string | null;
}

// 検証用ボタン。新方式（lib/pdf/v2）で PDF を生成しダウンロードする。
export default function PdfV2TestButton({
  documentType,
  order,
  customer,
  vehicle,
  shop,
  logoUrl,
  stampUrl,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      // フォントが重い（11MB+）ため、押下時に動的 import する
      const [{ generateOrderPdf }, { fetchTenantAssets }] = await Promise.all([
        import("@/lib/pdf/v2"),
        import("@/lib/pdf/v2/assets"),
      ]);
      const { logoDataUrl, stampDataUrl } = await fetchTenantAssets(
        logoUrl,
        stampUrl,
      );
      const blob = await generateOrderPdf({
        documentType,
        order,
        shop,
        customer,
        vehicle,
        logoDataUrl,
        stampDataUrl,
      });
      const fileName = buildPdfFileName({
        documentType,
        date: documentType === "invoice" ? order.invoiced_at : new Date(),
        customerName: customer?.name ?? null,
        orderNumber: order.id,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      console.error("PDF v2 生成失敗:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const label = documentType === "estimate" ? "見積書 (v2)" : "請求書 (v2)";

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
      >
        {busy ? "生成中..." : label}
      </button>
      {error && (
        <p role="alert" className="text-xs text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
