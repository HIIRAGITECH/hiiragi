import type { jsPDF } from "jspdf";
import { PAGE } from "./constants";
import type { PdfRenderInput } from "./types";
import type { LoadedImage } from "./utils/image";

// 各 section 関数で共有する描画コンテキスト。
// 関数は (doc, ctx) => number で「描画後の Y 座標」を返す慣例。
// 呼び出し側で ctx.cursorY = drawX(doc, ctx) と更新していく。
export interface RenderContext {
  input: PdfRenderInput;
  pageWidth: number;
  pageHeight: number;
  marginX: number;
  marginTop: number;
  marginBottom: number;
  cursorY: number;
  // 事前に Image() で自然サイズを解決済みの画像。
  // 各 section/overlay は同期的にこれを参照して addImage する。
  loadedAssets: {
    logo: LoadedImage | null;
    stamp: LoadedImage | null;
  };
}

export function createContext(
  doc: jsPDF,
  input: PdfRenderInput,
): RenderContext {
  return {
    input,
    pageWidth: doc.internal.pageSize.getWidth(),
    pageHeight: doc.internal.pageSize.getHeight(),
    marginX: PAGE.marginX,
    marginTop: PAGE.marginTop,
    marginBottom: PAGE.marginBottom,
    cursorY: PAGE.marginTop,
    loadedAssets: { logo: null, stamp: null },
  };
}

// autoTable は副作用で doc.lastAutoTable.finalY を設定する（型に出ていないため最小限のキャスト）
export function getLastAutoTableFinalY(doc: jsPDF): number {
  const t = (doc as unknown as { lastAutoTable?: { finalY: number } })
    .lastAutoTable;
  return t?.finalY ?? 0;
}

// 簡易な改ページ判定。残り高さが必要量未満なら addPage して cursorY を marginTop にリセット。
export function ensureSpace(
  doc: jsPDF,
  ctx: RenderContext,
  requiredMm: number,
): void {
  const remaining = ctx.pageHeight - ctx.marginBottom - ctx.cursorY;
  if (remaining < requiredMm) {
    doc.addPage();
    ctx.cursorY = ctx.marginTop;
  }
}
