"use client";

import { useState } from "react";
import type { Customer, Order, ShopInfo, Vehicle } from "@/lib/types";
import { buildPdfFileName } from "@/lib/pdf/file-name";
import type { PdfDocumentType } from "@/lib/pdf/v2";

interface PdfButtonProps {
  documentType: PdfDocumentType;
  order: Order;
  customer: Customer | null;
  vehicle: Vehicle | null;
  shop: ShopInfo;
  // Supabase Storage 上の画像 signed URL（fail-soft：取得失敗でも PDF は生成される）
  logoUrl: string | null;
  stampUrl: string | null;
}

// 受注 PDF（見積書 or 請求書）をクライアント側で生成しダウンロードするボタン。
// 旧 html2canvas-pro 方式から jspdf-autotable + 日本語フォント埋め込み方式へ移行。
// 見た目・ローディング・エラーハンドリングは旧実装を踏襲。
export default function PdfButton({
  documentType,
  order,
  customer,
  vehicle,
  shop,
  logoUrl,
  stampUrl,
}: PdfButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleClick = async (): Promise<void> => {
    setIsGenerating(true);
    try {
      // フォントが重い（11MB+）ため、ボタン押下時に動的 import する
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
        customer,
        vehicle,
        shop,
        logoDataUrl,
        stampDataUrl,
      });

      const fileName = buildPdfFileName({
        documentType,
        date:
          documentType === "invoice"
            ? (order.invoiced_at ?? new Date())
            : new Date(),
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
