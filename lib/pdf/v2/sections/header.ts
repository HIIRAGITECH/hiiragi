import type { jsPDF } from "jspdf";
import { formatDate } from "@/lib/format";
import { COLORS, FONT_FAMILY, FONT_SIZE } from "../constants";
import type { RenderContext } from "../context";

// 1ページ目のヘッダー帯。
// - 中央: タイトル「見積書」or「請求書」
// - 右側: 管理No / 発行日 / 受付日（小さく）
// - 左上: ロゴ位置（Step 5 で実装）
// - 右上: 印鑑位置（Step 5 で実装、parties セクション側で扱う方が自然なら移す）
export function drawHeader(doc: jsPDF, ctx: RenderContext): number {
  const title = ctx.input.documentType === "estimate" ? "見積書" : "請求書";

  // タイトル中央
  doc.setFont(FONT_FAMILY, "bold");
  doc.setFontSize(FONT_SIZE.title);
  doc.setTextColor(COLORS.black[0], COLORS.black[1], COLORS.black[2]);
  doc.text(title, ctx.pageWidth / 2, ctx.cursorY + 6, { align: "center" });

  // 文書情報（右上）: 管理No / 発行日 / 受付日
  const today = new Date().toISOString().slice(0, 10);
  const order = ctx.input.order;
  const rightX = ctx.pageWidth - ctx.marginX;
  const labelOffsetX = 28;
  let infoY = ctx.cursorY + 2;

  doc.setFont(FONT_FAMILY, "normal");
  doc.setFontSize(FONT_SIZE.small);
  doc.setTextColor(COLORS.gray[0], COLORS.gray[1], COLORS.gray[2]);

  function infoRow(label: string, value: string): void {
    doc.setTextColor(COLORS.gray[0], COLORS.gray[1], COLORS.gray[2]);
    doc.text(label, rightX - labelOffsetX, infoY, { align: "left" });
    doc.setTextColor(COLORS.black[0], COLORS.black[1], COLORS.black[2]);
    doc.text(value, rightX, infoY, { align: "right" });
    infoY += 4;
  }

  infoRow("管理No.", order.id);
  infoRow("発行日", formatDate(today));
  infoRow("受付日", formatDate(order.reception_date));

  doc.setTextColor(COLORS.black[0], COLORS.black[1], COLORS.black[2]);

  // タイトルブロックの最終 Y は中央タイトル下端を起点にする
  return ctx.cursorY + 18;
}
