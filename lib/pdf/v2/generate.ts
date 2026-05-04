import { jsPDF } from "jspdf";
import { registerJapaneseFont } from "../fonts/register";
import { PAGE } from "./constants";
import { createContext } from "./context";
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
// autoTable は内部で改ページしてくれるので、本体側ではセクション境界の
// 改ページのみ ensureSpace で面倒を見る。
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

  ctx.cursorY = drawHeader(doc, ctx);
  ctx.cursorY = drawParties(doc, ctx);
  ctx.cursorY = drawVehicle(doc, ctx);
  ctx.cursorY = drawItemsTable(doc, ctx);
  ctx.cursorY = drawTotals(doc, ctx);
  ctx.cursorY = drawPaymentInfo(doc, ctx);
  ctx.cursorY = drawNotes(doc, ctx);

  return doc.output("blob");
}
