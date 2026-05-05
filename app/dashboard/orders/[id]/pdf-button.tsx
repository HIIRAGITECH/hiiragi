"use client";

import { useState } from "react";
import { buildPdfFileName } from "@/lib/pdf/file-name";
import type { Customer, Order, ShopInfo, Vehicle } from "@/lib/types";

export type PdfDocumentType = "estimate" | "invoice";

interface PdfButtonProps {
  documentType: PdfDocumentType;
  order: Order;
  customer: Customer | null;
  vehicle: Vehicle | null;
  shop: ShopInfo;
  // 旧 jsPDF 実装ではクライアント側で fetch していたが、新方式では route handler で
  // 取得するため不要。受注 page から渡されるが本コンポーネントでは利用しない。
  logoUrl: string | null;
  stampUrl: string | null;
}

// 受注 PDF を /api/invoice-pdf/[id] からダウンロードするボタン。
// 旧 jsPDF + 11MB+ のフォント埋め込みを廃止し、サーバ側 (@react-pdf/renderer) で生成する。
export default function PdfButton({
  documentType,
  order,
  customer,
}: PdfButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleClick = async (): Promise<void> => {
    setIsGenerating(true);
    try {
      const url = `/api/invoice-pdf/${encodeURIComponent(order.id)}?type=${documentType}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const fileName = buildPdfFileName({
        documentType,
        date:
          documentType === "invoice"
            ? (order.invoiced_at ?? new Date())
            : new Date(),
        customerName: customer?.name ?? null,
        orderNumber: order.id,
      });

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (err: unknown) {
      console.error("PDF生成失敗:", err);
      const message = err instanceof Error ? err.message : String(err);
      alert("PDF生成に失敗しました: " + message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isGenerating}
      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      {isGenerating ? "生成中..." : "PDFで開く"}
    </button>
  );
}
