import type { jsPDF } from "jspdf";
import { formatDate } from "@/lib/format";
import { COLORS, FONT_FAMILY, FONT_SIZE } from "../constants";
import type { RenderContext } from "../context";

// 1ページ目のヘッダー帯。
// - 左上: 空白（ロゴは透かしと重複するため非表示。loadedAssets.logo は透かし用に保持）
// - 中央: タイトル「見積書」or「請求書」
// - 右側: 管理No / 発行日 / 受付日
// 印鑑は parties セクションで会社情報ブロックの直下に配置（既存 HTML 帳票準拠）。
export function drawHeader(doc: jsPDF, ctx: RenderContext): number {
  // 中央: タイトル
  const title = ctx.input.documentType === "estimate" ? "見積書" : "請求書";
  doc.setFont(FONT_FAMILY, "bold");
  doc.setFontSize(FONT_SIZE.title);
  doc.setTextColor(COLORS.black[0], COLORS.black[1], COLORS.black[2]);
  doc.text(title, ctx.pageWidth / 2, ctx.cursorY + 6, { align: "center" });

  // 右側: 文書情報
  const today = new Date().toISOString().slice(0, 10);
  const order = ctx.input.order;
  const rightX = ctx.pageWidth - ctx.marginX;
  const labelOffsetX = 28;
  let infoY = ctx.cursorY + 2;

  doc.setFont(FONT_FAMILY, "normal");
  doc.setFontSize(FONT_SIZE.small);

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

  return ctx.cursorY + 18;
}
