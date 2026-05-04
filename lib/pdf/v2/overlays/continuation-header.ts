import type { jsPDF } from "jspdf";
import { COLORS, FONT_FAMILY, FONT_SIZE } from "../constants";
import type { RenderContext } from "../context";

// 2ページ目以降の上部に表示する細い帯。
// - 左: タイトル「見積書（つづき）」or「請求書（つづき）」（太字、primary 色）
// - 中央: 文書番号 + 顧客名 + 様（gray）
// - 右: ページ番号 「2 / 3」（gray）
// - Y=14mm に薄い水平線（primary、線幅 0.3mm）
//
// 本文と被らないよう、PAGE.marginTop を 25mm に引き上げている（constants.ts）。
export function drawContinuationHeader(
  doc: jsPDF,
  ctx: RenderContext,
  page: number,
  total: number,
): void {
  const { documentType, order, customer } = ctx.input;

  const titleText =
    documentType === "estimate" ? "見積書（つづき）" : "請求書（つづき）";
  const centerText = `${order.id}  ${customer?.name ?? "—"} 様`;
  const rightText = `${page} / ${total}`;

  const textY = 10;
  const lineY = 14;

  // 左: タイトル
  doc.setFont(FONT_FAMILY, "bold");
  doc.setFontSize(FONT_SIZE.section);
  doc.setTextColor(COLORS.primary[0], COLORS.primary[1], COLORS.primary[2]);
  doc.text(titleText, ctx.marginX, textY);

  // 中央: 文書番号 + 顧客名
  doc.setFont(FONT_FAMILY, "normal");
  doc.setFontSize(FONT_SIZE.body);
  doc.setTextColor(COLORS.gray[0], COLORS.gray[1], COLORS.gray[2]);
  doc.text(centerText, ctx.pageWidth / 2, textY, { align: "center" });

  // 右: ページ番号
  doc.text(rightText, ctx.pageWidth - ctx.marginX, textY, { align: "right" });

  // 区切り線
  doc.setDrawColor(COLORS.primary[0], COLORS.primary[1], COLORS.primary[2]);
  doc.setLineWidth(0.3);
  doc.line(ctx.marginX, lineY, ctx.pageWidth - ctx.marginX, lineY);

  // 後続描画への影響を抑えるためデフォルト色に戻す
  doc.setTextColor(COLORS.black[0], COLORS.black[1], COLORS.black[2]);
  doc.setDrawColor(0, 0, 0);
}
