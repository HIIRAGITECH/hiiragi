"use client";

import type { Customer, Order, ShopInfo, Vehicle } from "@/lib/types";

export type PdfDocumentType = "estimate" | "invoice";

interface PdfButtonProps {
  documentType: PdfDocumentType;
  order: Order;
  customer: Customer | null;
  vehicle: Vehicle | null;
  shop: ShopInfo;
  logoUrl: string | null;
  stampUrl: string | null;
}

// PDF 生成は移行作業中（jsPDF → @react-pdf/renderer）。
// 後続コミットで /api/invoice-pdf/[id] への呼び出しに差し替える。
export default function PdfButton(_: PdfButtonProps) {
  const handleClick = () => {
    alert("PDF 生成は移行作業中です。完了までしばらくお待ちください。");
  };

  return (
    <button
      type="button"
      onClick={handleClick}
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
      PDFで開く
    </button>
  );
}
