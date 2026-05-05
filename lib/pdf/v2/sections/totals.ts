import type { jsPDF } from "jspdf";
import { calculateTotals } from "@/lib/orders/totals";
import { formatYen } from "@/lib/format";
import { COLORS, FONT_FAMILY, FONT_SIZE } from "../constants";
import { ensureSpace, type RenderContext } from "../context";

// 合計セクション。右寄せに描画。
// 計算は lib/orders/totals.ts の calculateTotals をそのまま流用し
// HTML 帳票（printable-document.tsx）と完全に揃える。
//
// 行の Y 座標設計（行頭 Y を起点にする）:
//  ・上線（divider / emphasize 上線） … y（行頭）
//  ・ベースライン                       … y + 4mm（9pt）/ y + 5mm（11pt強調）
//      根拠: フォント9pt（高さ約3.2mm、ascender約2.3mm）/ 11pt（高さ約3.9mm、ascender約2.8mm）
//      に対し、線→ascender top→baseline で約4〜5mm。
//  ・下線（emphasize の下線のみ）       … baseline + 2mm
//      根拠: フォント11ptのdescenderは約1mm。下線をbaseline+2mmに置くことで
//      数字の下端から1mmの余白を確保し重なりを避ける。
//  ・次の行頭                           … 通常行: baseline + 2mm / 強調行: 下線 + 2mm
//      前の行の descender（約0.7〜1mm）から1mm以上離して次の上線を置く。
// 旧実装は上線を「次の行の y - 1mm」に置いていたため、前の行のベースラインと
// 完全一致して数字に線が被っていた。新実装ではこの重なりを根本的に解消する。
export function drawTotals(doc: jsPDF, ctx: RenderContext): number {
  const { order } = ctx.input;
  const items = ctx.input.items ?? order.items ?? [];
  const totals = calculateTotals(
    items,
    order.discount_amount,
    order.deposit_amount,
  );

  // 必要高さの目安。行数 × 6mm + 強調2行分（11mm × 2）+ 余白を確保。
  ensureSpace(doc, ctx, 60);

  const blockWidth = 70;
  const valueX = ctx.pageWidth - ctx.marginX;
  const labelX = valueX - blockWidth + 4;

  // y は「次に描画する行の頭」。前のセクションから 2mm 余白を取って開始。
  let y = ctx.cursorY + 2;

  function row(
    label: string,
    value: string,
    opts?: { divider?: boolean; emphasize?: boolean },
  ): void {
    // フォント設定（オフセット計算で参照するので最初に切替）
    if (opts?.emphasize) {
      doc.setFont(FONT_FAMILY, "bold");
      doc.setFontSize(FONT_SIZE.section);
    } else {
      doc.setFont(FONT_FAMILY, "normal");
      doc.setFontSize(FONT_SIZE.body);
    }

    // 上線（行頭 Y）。前の行のテキストとは行頭まで余白（通常 +2mm）が確保されている。
    if (opts?.divider || opts?.emphasize) {
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(opts?.emphasize ? 0.5 : 0.3);
      doc.line(valueX - blockWidth, y, valueX, y);
    }

    // フォント9pt(高3.2mm)はベースラインを上線+4mmに、
    // フォント11pt(高3.9mm)はベースラインを上線+5mmに。
    const baselineOffset = opts?.emphasize ? 5 : 4;
    const baselineY = y + baselineOffset;

    doc.setTextColor(COLORS.black[0], COLORS.black[1], COLORS.black[2]);
    doc.text(label, labelX, baselineY);
    doc.text(value, valueX, baselineY, { align: "right" });

    if (opts?.emphasize) {
      // 下線: ベースライン+2mm（フォント11ptのdescender約1mmに対し1mm余白）
      const bottomLineY = baselineY + 2;
      doc.setLineWidth(0.5);
      doc.line(valueX - blockWidth, bottomLineY, valueX, bottomLineY);
      // 次の行頭まで2mm余白
      y = bottomLineY + 2;
    } else {
      // 通常行: ベースライン+2mm を次の行頭にする（descender ≒1mmを1mm余白で逃げる）
      y = baselineY + 2;
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
