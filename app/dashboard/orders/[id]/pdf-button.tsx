"use client";

import { useState } from "react";
import { generatePdfFromElement } from "@/lib/pdf/generate-pdf";

interface PdfButtonProps {
  targetId: string;
  fileName: string;
}

export default function PdfButton({ targetId, fileName }: PdfButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleClick = async (): Promise<void> => {
    const el = document.getElementById(targetId);
    if (!el) {
      alert("PDF対象要素が見つかりません");
      return;
    }
    setIsGenerating(true);
    try {
      await generatePdfFromElement(el, fileName);
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
