import type { jsPDF } from "jspdf";
import { formatDate } from "@/lib/format";
import { COLORS, FONT_FAMILY, FONT_SIZE } from "../constants";
import type { RenderContext } from "../context";
import { detectImageFormat, fitInBox } from "../utils/image";

// ロゴ枠の最大サイズ（アスペクト比保持で内側にフィット）
const LOGO_MAX_W = 30;
const LOGO_MAX_H = 18;

// 1ページ目のヘッダー帯。
// - 左上: 店舗ロゴ（logo）
// - 中央: タイトル「見積書」or「請求書」
// - 右側: 管理No / 発行日 / 受付日
// 印鑑は parties セクションで店舗名の右に重ねる（既存 HTML 帳票準拠）。
export function drawHeader(doc: jsPDF, ctx: RenderContext): number {
  // 左上: ロゴ（読み込み済みの logo があれば描画）
  drawShopLogo(doc, ctx);

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

function drawShopLogo(doc: jsPDF, ctx: RenderContext): void {
  const logo = ctx.loadedAssets.logo;
  if (!logo) return;
  const { w, h } = fitInBox(
    { width: logo.width, height: logo.height },
    LOGO_MAX_W,
    LOGO_MAX_H,
  );
  // marginTop = 25 として、ロゴの上端を Y=marginTop-15=10 付近に置く
  const x = ctx.marginX;
  const y = ctx.cursorY - 15;
  try {
    doc.addImage(logo.dataUrl, detectImageFormat(logo.dataUrl), x, y, w, h);
  } catch (err) {
    console.warn("ロゴの addImage に失敗（ロゴなしで継続）", err);
  }
}
