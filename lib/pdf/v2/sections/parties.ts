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
// - 印鑑: 会社情報ブロックの直下、右端揃え（重ねると会社名・住所が読めないため
//   従来の「店舗名右に重ね描画」方式から変更）
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
  // 各行を描画しながら、印鑑の最大幅制約用に最大テキスト幅を集計する。
  let shopBlockWidth = 0;

  doc.setFont(FONT_FAMILY, "bold");
  doc.setFontSize(FONT_SIZE.section);
  doc.setTextColor(COLORS.black[0], COLORS.black[1], COLORS.black[2]);
  const shopName = shop.shop_name || "（店舗名 未設定）";
  shopBlockWidth = Math.max(shopBlockWidth, doc.getTextWidth(shopName));
  doc.text(shopName, rightX, rightY + 5, { align: "right" });
  rightY += 7;

  doc.setFont(FONT_FAMILY, "normal");
  doc.setFontSize(FONT_SIZE.small);
  doc.setTextColor(COLORS.black[0], COLORS.black[1], COLORS.black[2]);
  if (shop.address) {
    shopBlockWidth = Math.max(shopBlockWidth, doc.getTextWidth(shop.address));
    doc.text(shop.address, rightX, rightY + 3, { align: "right" });
    rightY += 4;
  }
  if (shop.phone) {
    const phoneLine = `TEL: ${shop.phone}`;
    shopBlockWidth = Math.max(shopBlockWidth, doc.getTextWidth(phoneLine));
    doc.text(phoneLine, rightX, rightY + 3, { align: "right" });
    rightY += 4;
  }
  if (shop.registration_no) {
    const regLine = `登録番号: ${shop.registration_no}`;
    shopBlockWidth = Math.max(shopBlockWidth, doc.getTextWidth(regLine));
    doc.text(regLine, rightX, rightY + 3, { align: "right" });
    rightY += 4;
  }

  // 印鑑（会社情報ブロックの直下、右端揃え）
  // 会社情報ブロックの幅を超えないよう、最大幅を制限する。
  const stampStartY = rightY + 2;
  const stampEndY = drawShopStamp(
    doc,
    ctx,
    rightX,
    stampStartY,
    shopBlockWidth,
  );
  rightY = Math.max(rightY, stampEndY);

  return Math.max(leftY, rightY) + 4;
}

// 印鑑画像を会社情報の直下に配置する。
// - 右端を rightX（pageWidth - marginX）に揃える
// - サイズは max(STAMP_MAX_W, blockMaxW) と STAMP_MAX_H の枠でアスペクト比保持
// - 印鑑が未設定 or 描画失敗時は startY をそのまま返して上位に影響しない
function drawShopStamp(
  doc: jsPDF,
  ctx: RenderContext,
  rightX: number,
  startY: number,
  blockMaxW: number,
): number {
  const stamp = ctx.loadedAssets.stamp;
  if (!stamp) return startY;
  const maxW = Math.min(STAMP_MAX_W, Math.max(0, blockMaxW));
  if (maxW <= 0) return startY;
  const { w, h } = fitInBox(
    { width: stamp.width, height: stamp.height },
    maxW,
    STAMP_MAX_H,
  );
  const x = rightX - w;
  const y = startY;
  try {
    doc.addImage(stamp.dataUrl, detectImageFormat(stamp.dataUrl), x, y, w, h);
  } catch (err) {
    console.warn("印鑑の addImage に失敗（印鑑なしで継続）", err);
    return startY;
  }
  return y + h;
}
