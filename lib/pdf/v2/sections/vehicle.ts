import type { jsPDF } from "jspdf";
import { COLORS, FONT_FAMILY, FONT_SIZE } from "../constants";
import type { RenderContext } from "../context";

// 車両情報の枠。printable-document.tsx と同じ4項目を 2列 grid で表示。
//   ナンバー / メーカー・車種 / 年式 / 車台番号
export function drawVehicle(doc: jsPDF, ctx: RenderContext): number {
  const { vehicle } = ctx.input;

  const x = ctx.marginX;
  const y = ctx.cursorY;
  const width = ctx.pageWidth - ctx.marginX * 2;
  const headerH = 5;
  const rowH = 5;
  const totalH = headerH + rowH * 2 + 3;

  // 枠線
  doc.setDrawColor(
    COLORS.tableLine[0],
    COLORS.tableLine[1],
    COLORS.tableLine[2],
  );
  doc.setLineWidth(0.2);
  doc.rect(x, y, width, totalH);

  // ヘッダー「車両情報」
  doc.setFont(FONT_FAMILY, "bold");
  doc.setFontSize(FONT_SIZE.small);
  doc.setTextColor(COLORS.gray[0], COLORS.gray[1], COLORS.gray[2]);
  doc.text("車両情報", x + 2, y + 4);

  // 2列レイアウト
  const colW = width / 2;
  const labelW = 22;
  const fields: { label: string; value: string }[] = [
    { label: "ナンバー", value: vehicle?.plate_number ?? "—" },
    {
      label: "メーカー / 車種",
      value: `${vehicle?.maker ?? "—"} / ${vehicle?.model ?? "—"}`,
    },
    {
      label: "年式",
      value: vehicle?.model_year ? `${vehicle.model_year}年` : "—",
    },
    { label: "車台番号", value: vehicle?.vin ?? "—" },
  ];

  doc.setFont(FONT_FAMILY, "normal");
  doc.setFontSize(FONT_SIZE.small);

  for (let i = 0; i < fields.length; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cellX = x + col * colW + 3;
    const cellY = y + headerH + row * rowH + 4;

    doc.setTextColor(COLORS.gray[0], COLORS.gray[1], COLORS.gray[2]);
    doc.text(fields[i].label, cellX, cellY);
    doc.setTextColor(COLORS.black[0], COLORS.black[1], COLORS.black[2]);
    doc.text(fields[i].value, cellX + labelW, cellY);
  }

  doc.setTextColor(COLORS.black[0], COLORS.black[1], COLORS.black[2]);

  return y + totalH + 4;
}
