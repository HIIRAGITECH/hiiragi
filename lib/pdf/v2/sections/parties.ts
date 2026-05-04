import type { jsPDF } from "jspdf";
import { COLORS, FONT_FAMILY, FONT_SIZE } from "../constants";
import type { RenderContext } from "../context";
import { detectImageFormat, fitInBox } from "../utils/image";

// 印鑑枠の最大サイズ（アスペクト比保持）
const STAMP_MAX_W = 22;
const STAMP_MAX_H = 22;

// 顧客情報（左）と整備工場情報（右）を左右配置。
// - 左: 「○○ 様」+ リード文
// - 右: 店舗名 / 住所 / TEL / 登録番号
// - 印鑑: 店舗名の右側に重ねる（既存 HTML 帳票と同じ位置取り）
export function drawParties(doc: jsPDF, ctx: RenderContext): number {
  const { customer, shop, documentType } = ctx.input;

  const leftX = ctx.marginX;
  const rightX = ctx.pageWidth - ctx.marginX;

  let leftY = ctx.cursorY;
  let rightY = ctx.cursorY;

  // 左: 顧客名（下線付き）+ 様
  doc.setFont(FONT_FAMILY, "normal");
  doc.setFontSize(FONT_SIZE.section);
  doc.setTextColor(COLORS.black[0], COLORS.black[1], COLORS.black[2]);
  const customerName = customer?.name ?? "—";
  const customerNameWidth = doc.getTextWidth(customerName);
  doc.text(customerName, leftX, leftY + 5);
  doc.setLineWidth(0.3);
  doc.setDrawColor(0, 0, 0);
  doc.line(leftX, leftY + 6.5, leftX + customerNameWidth + 2, leftY + 6.5);
  doc.setFont(FONT_FAMILY, "normal");
  doc.setFontSize(FONT_SIZE.body);
  doc.text("様", leftX + customerNameWidth + 4, leftY + 5);
  leftY += 11;

  // リード文
  doc.setFont(FONT_FAMILY, "normal");
  doc.setFontSize(FONT_SIZE.small);
  doc.setTextColor(COLORS.gray[0], COLORS.gray[1], COLORS.gray[2]);
  const lead =
    documentType === "estimate"
      ? "下記の通りお見積申し上げます。"
      : "下記の通りご請求申し上げます。";
  doc.text(lead, leftX, leftY + 4);
  leftY += 8;

  // 右: 整備工場情報（店舗名 / 住所 / TEL / 登録番号）
  doc.setFont(FONT_FAMILY, "bold");
  doc.setFontSize(FONT_SIZE.section);
  doc.setTextColor(COLORS.black[0], COLORS.black[1], COLORS.black[2]);
  const shopName = shop.shop_name || "（店舗名 未設定）";
  doc.text(shopName, rightX, rightY + 5, { align: "right" });
  rightY += 7;

  doc.setFont(FONT_FAMILY, "normal");
  doc.setFontSize(FONT_SIZE.small);
  doc.setTextColor(COLORS.black[0], COLORS.black[1], COLORS.black[2]);
  if (shop.address) {
    doc.text(shop.address, rightX, rightY + 3, { align: "right" });
    rightY += 4;
  }
  if (shop.phone) {
    doc.text(`TEL: ${shop.phone}`, rightX, rightY + 3, { align: "right" });
    rightY += 4;
  }
  if (shop.registration_no) {
    doc.text(`登録番号: ${shop.registration_no}`, rightX, rightY + 3, {
      align: "right",
    });
    rightY += 4;
  }

  // 印鑑（店舗名の右側に重ねる）。本文より後に描画して上に出す。
  drawShopStamp(doc, ctx, rightX);

  return Math.max(leftY, rightY) + 4;
}

function drawShopStamp(
  doc: jsPDF,
  ctx: RenderContext,
  rightX: number,
): void {
  const stamp = ctx.loadedAssets.stamp;
  if (!stamp) return;
  const { w, h } = fitInBox(
    { width: stamp.width, height: stamp.height },
    STAMP_MAX_W,
    STAMP_MAX_H,
  );
  // 店舗名の右に少しはみ出して配置（HTML 帳票で translateX(6) と translateY(-50%) 相当）
  const x = rightX - w + 6;
  // 店舗名のベースライン付近（rightY 起点）に対して中央寄せ
  const y = ctx.cursorY + 3 - h / 2 + 3;
  try {
    doc.addImage(stamp.dataUrl, detectImageFormat(stamp.dataUrl), x, y, w, h);
  } catch (err) {
    console.warn("印鑑の addImage に失敗（印鑑なしで継続）", err);
  }
}
