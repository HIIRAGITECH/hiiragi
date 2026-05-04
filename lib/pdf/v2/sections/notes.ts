import type { jsPDF } from "jspdf";
import { COLORS, FONT_FAMILY, FONT_SIZE } from "../constants";
import { ensureSpace, type RenderContext } from "../context";

// 備考。order.notes が空でないときのみ描画。
// 改行は splitTextToSize で折り返し（printable-document.tsx の whitespace-pre-wrap 相当）。
export function drawNotes(doc: jsPDF, ctx: RenderContext): number {
  const notes = ctx.input.order.notes;
  if (!notes || notes.trim() === "") return ctx.cursorY;

  const x = ctx.marginX;
  const width = ctx.pageWidth - ctx.marginX * 2;

  ensureSpace(doc, ctx, 20);
  let y = ctx.cursorY + 4;

  // 上に区切り線
  doc.setDrawColor(
    COLORS.tableLine[0],
    COLORS.tableLine[1],
    COLORS.tableLine[2],
  );
  doc.setLineWidth(0.2);
  doc.line(x, y, x + width, y);

  // 「備考」見出し
  doc.setFont(FONT_FAMILY, "bold");
  doc.setFontSize(FONT_SIZE.body);
  doc.setTextColor(COLORS.black[0], COLORS.black[1], COLORS.black[2]);
  doc.text("備考", x, y + 5);
  y += 8;

  // 本文（折り返し）
  doc.setFont(FONT_FAMILY, "normal");
  doc.setFontSize(FONT_SIZE.body);
  const lines = doc.splitTextToSize(notes, width) as string[];
  for (const line of lines) {
    ensureSpace(doc, ctx, 6);
    doc.text(line, x, y);
    y += 4.5;
  }

  return y;
}
