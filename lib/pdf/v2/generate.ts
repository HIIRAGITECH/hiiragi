import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { registerJapaneseFont } from "../fonts/register";
import { COLORS, FONT_FAMILY, FONT_SIZE, PAGE } from "./constants";
import type { PdfRenderInput } from "./types";

// 受注 PDF を生成して Blob を返す。
// この時点では「タイトル + ダミー明細テーブル」だけの最小構成。
// Step 3 以降で本実装に差し替える。
export async function generateOrderPdf(
  input: PdfRenderInput,
): Promise<Blob> {
  const doc = new jsPDF({
    unit: PAGE.unit,
    format: PAGE.format,
    orientation: "portrait",
  });

  registerJapaneseFont(doc);

  // タイトル
  const title = input.documentType === "estimate" ? "見積書" : "請求書";
  doc.setFont(FONT_FAMILY, "bold");
  doc.setFontSize(FONT_SIZE.title);
  doc.text(title, 105, 25, { align: "center" });

  // ダミー明細（最大5件）
  const items = (input.items ?? input.order.items ?? []).slice(0, 5);
  autoTable(doc, {
    startY: 40,
    head: [["品名", "数量", "工賃", "部品代", "小計"]],
    body: items.map((it) => [
      it.name ?? "",
      String(it.quantity ?? ""),
      String(it.labor_cost ?? ""),
      String(it.parts_cost ?? ""),
      String((it.labor_cost ?? 0) + (it.parts_cost ?? 0)),
    ]),
    styles: {
      font: FONT_FAMILY,
      fontStyle: "normal",
      fontSize: FONT_SIZE.body,
    },
    headStyles: {
      font: FONT_FAMILY,
      fontStyle: "bold",
      fillColor: COLORS.primary,
      textColor: [255, 255, 255],
    },
  });

  return doc.output("blob");
}
