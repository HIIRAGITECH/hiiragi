import { jsPDF } from "jspdf";
import { registerJapaneseFont } from "../fonts/register";
import { PAGE } from "./constants";
import { createContext } from "./context";
import { drawContinuationHeader } from "./overlays/continuation-header";
import {
  drawWatermark,
  loadWatermark,
  type WatermarkAssets,
} from "./overlays/watermark";
import { drawHeader } from "./sections/header";
import { drawItemsTable } from "./sections/items-table";
import { drawNotes } from "./sections/notes";
import { drawParties } from "./sections/parties";
import { drawPaymentInfo } from "./sections/payment-info";
import { drawTotals } from "./sections/totals";
import { drawVehicle } from "./sections/vehicle";
import type { PdfRenderInput } from "./types";

// 受注 PDF を生成して Blob を返す。
// 各 section は (doc, ctx) => number で「描画後の Y 座標」を返す約束。
// 透かし & 2ページ目以降のヘッダーは generate 側で総ページ数を取得した上で
// 全ページを後追いで上書き描画する（jsPDF にはページ追加時フックがないため）。
export async function generateOrderPdf(
  input: PdfRenderInput,
): Promise<Blob> {
  const doc = new jsPDF({
    unit: PAGE.unit,
    format: PAGE.format,
    orientation: "portrait",
  });

  registerJapaneseFont(doc);

  const ctx = createContext(doc, input);

  // 本文
  ctx.cursorY = drawHeader(doc, ctx);
  ctx.cursorY = drawParties(doc, ctx);
  ctx.cursorY = drawVehicle(doc, ctx);
  ctx.cursorY = drawItemsTable(doc, ctx);
  ctx.cursorY = drawTotals(doc, ctx);
  ctx.cursorY = drawPaymentInfo(doc, ctx);
  ctx.cursorY = drawNotes(doc, ctx);

  // 透かしロゴ（logoDataUrl があれば全ページ中央に薄く重ねる）
  // 失敗してもエラーにせず透かしなしで継続する
  let watermark: WatermarkAssets | null = null;
  if (input.logoDataUrl) {
    try {
      watermark = await loadWatermark(input.logoDataUrl);
    } catch (err) {
      console.warn("透かしロゴの読み込みに失敗（透かしなしで継続）", err);
    }
  }

  // 全ページに対して: 透かし → 2ページ目以降のヘッダー の順で上書き
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    drawWatermark(doc, ctx, watermark);
    if (i >= 2) {
      drawContinuationHeader(doc, ctx, i, totalPages);
    }
  }

  return doc.output("blob");
}
