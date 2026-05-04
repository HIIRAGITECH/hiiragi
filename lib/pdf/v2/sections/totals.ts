import type { jsPDF } from "jspdf";
import { calculateTotals } from "@/lib/orders/totals";
import { formatYen } from "@/lib/format";
import { COLORS, FONT_FAMILY, FONT_SIZE } from "../constants";
import { ensureSpace, type RenderContext } from "../context";

// 合計セクション。右寄せに描画。
// 計算は lib/orders/totals.ts の calculateTotals をそのまま流用し
// HTML 帳票（printable-document.tsx）と完全に揃える。
export function drawTotals(doc: jsPDF, ctx: RenderContext): number {
  const { order } = ctx.input;
  const items = ctx.input.items ?? order.items ?? [];
  const totals = calculateTotals(
    items,
    order.discount_amount,
    order.deposit_amount,
  );

  // 必要高さの目安。改ページ判定はざっくり（行数 × 5mm + 余白）。
  ensureSpace(doc, ctx, 50);

  const blockWidth = 70;
  const valueX = ctx.pageWidth - ctx.marginX;
  const labelX = valueX - blockWidth + 4;
  let y = ctx.cursorY + 4;

  function row(
    label: string,
    value: string,
    opts?: { divider?: boolean; emphasize?: boolean },
  ): void {
    if (opts?.divider) {
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.3);
      doc.line(valueX - blockWidth, y - 1, valueX, y - 1);
    }
    if (opts?.emphasize) {
      // 上下二重線で強調（合計・差引請求額）
      doc.setLineWidth(0.5);
      doc.setDrawColor(0, 0, 0);
      doc.line(valueX - blockWidth, y - 1, valueX, y - 1);
      doc.setFont(FONT_FAMILY, "bold");
      doc.setFontSize(FONT_SIZE.section);
    } else {
      doc.setFont(FONT_FAMILY, "normal");
      doc.setFontSize(FONT_SIZE.body);
    }
    doc.setTextColor(COLORS.black[0], COLORS.black[1], COLORS.black[2]);
    doc.text(label, labelX, y + 4);
    doc.text(value, valueX, y + 4, { align: "right" });
    y += opts?.emphasize ? 7 : 5;
    if (opts?.emphasize) {
      doc.setLineWidth(0.5);
      doc.line(valueX - blockWidth, y - 1, valueX, y - 1);
      // 強調行の後ろに余白を置いて視覚的に分離
      y += 1.5;
    }
  }

  if (totals.sections.normal.subtotal > 0) {
    row("整備小計", formatYen(totals.sections.normal.subtotal));
  }
  if (totals.sections.shakenTaxable.subtotal > 0) {
    row("車検課税小計", formatYen(totals.sections.shakenTaxable.subtotal));
  }
  if (totals.sections.shakenTaxFree.subtotal > 0) {
    row("車検非課税小計", formatYen(totals.sections.shakenTaxFree.subtotal));
  }
  if (totals.discount > 0) {
    row("値引き", `− ${formatYen(totals.discount)}`, { divider: true });
  }
  row("課税対象額", formatYen(totals.taxableAmount), { divider: true });
  row("消費税(10%)", formatYen(totals.tax));
  row("合計", formatYen(totals.total), { emphasize: true });
  if (totals.deposit > 0) {
    row("預かり金", `− ${formatYen(totals.deposit)}`);
    row("差引請求額", formatYen(totals.balance), { emphasize: true });
  }

  return y + 2;
}
