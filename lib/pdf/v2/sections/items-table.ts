import type { jsPDF } from "jspdf";
import autoTable, { type CellInput, type RowInput } from "jspdf-autotable";
import { rowSubtotal } from "@/lib/orders/totals";
import { formatYen } from "@/lib/format";
import type { OrderItem } from "@/lib/types";
import {
  CATEGORIES,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  type CategoryKey,
} from "../constants";
import { getLastAutoTableFinalY, type RenderContext } from "../context";

// printable-document.tsx と同じカテゴリ判定
function categorize(it: OrderItem): CategoryKey {
  if (it.type === "shaken") {
    return it.tax_free ? "shakenTaxFree" : "shakenTaxable";
  }
  return "maintenance";
}

// 1 行分の cells を組み立てる。
// 工賃/部品代のいずれかが入力されている明細は 5列で表示、
// どちらも未設定の明細は「工賃 + 部品代」セルを colSpan: 2 で結合し
// 単価 (unit_price) を表示する（C 案）。
function buildItemRow(it: OrderItem): RowInput {
  const showBreakdown = it.labor_cost != null || it.parts_cost != null;

  const cells: CellInput[] = [
    it.name ?? "",
    String(it.quantity ?? ""),
  ];

  if (showBreakdown) {
    cells.push(
      it.labor_cost != null ? formatYen(it.labor_cost) : "—",
      it.parts_cost != null ? formatYen(it.parts_cost) : "—",
    );
  } else {
    cells.push({
      content: formatYen(it.unit_price ?? 0),
      colSpan: 2,
      styles: { halign: "right" },
    });
  }

  cells.push(formatYen(rowSubtotal(it)));
  return cells;
}

export function drawItemsTable(doc: jsPDF, ctx: RenderContext): number {
  const items = ctx.input.items ?? ctx.input.order.items ?? [];

  // 明細が空の場合は短いメッセージのみ
  if (items.length === 0) {
    doc.setFont(FONT_FAMILY, "normal");
    doc.setFontSize(FONT_SIZE.small);
    doc.setTextColor(COLORS.gray[0], COLORS.gray[1], COLORS.gray[2]);
    doc.text("明細がありません。", ctx.pageWidth / 2, ctx.cursorY + 8, {
      align: "center",
    });
    doc.setTextColor(COLORS.black[0], COLORS.black[1], COLORS.black[2]);
    return ctx.cursorY + 16;
  }

  // body 配列を組み立て: カテゴリ見出し行 → そのカテゴリの明細行
  const body: RowInput[] = [];
  for (const cat of CATEGORIES) {
    const itemsInCat = items.filter((i) => categorize(i) === cat.key);
    if (itemsInCat.length === 0) continue;

    body.push([
      {
        content: `【${cat.label}】`,
        colSpan: 5,
        styles: {
          fillColor: COLORS.categoryBand,
          textColor: [
            COLORS.black[0],
            COLORS.black[1],
            COLORS.black[2],
          ] as [number, number, number],
          fontStyle: "bold",
          halign: "left",
        },
      },
    ]);

    for (const it of itemsInCat) {
      body.push(buildItemRow(it));
    }
  }

  autoTable(doc, {
    startY: ctx.cursorY,
    head: [["品名", "数量", "工賃", "部品代", "小計"]],
    body,
    showHead: "everyPage",
    // 行が長くなって改ページに跨る場合は普通に分割する。
    // "avoid" だと行が縮められ、内部で折り返し行数と確保高さが食い違って
    // 中間行が消える事故が起きる（過去にこのバグ）。
    rowPageBreak: "auto",
    margin: {
      left: ctx.marginX,
      right: ctx.marginX,
      top: ctx.marginTop,
      bottom: ctx.marginBottom,
    },
    styles: {
      font: FONT_FAMILY,
      fontStyle: "normal",
      fontSize: FONT_SIZE.body,
      cellPadding: 2,
      lineColor: COLORS.tableLine,
      lineWidth: 0.1,
      textColor: COLORS.black,
      // CJK での幅計算に頼らず "linebreak" を明示。
      // セルが多行に折り返された場合は valign: top で上揃えにする。
      overflow: "linebreak",
      valign: "top",
    },
    headStyles: {
      font: FONT_FAMILY,
      fontStyle: "bold",
      fillColor: COLORS.primary,
      textColor: [255, 255, 255],
      halign: "center",
    },
    bodyStyles: {
      // minCellHeight を 0 にして行高の自動拡張（折り返し行数に追従）を妨げない
      minCellHeight: 0,
    },
    columnStyles: {
      // 品名列を数値固定にして autoTable に「この幅で折り返せ」と明示する。
      // CJK では cellWidth: "auto" だと内部の getStringUnitWidth による幅計算が
      // ズレ、折り返し行数と確保高さの整合が取れず中間行が描画されないバグになる。
      //
      // 合計 75 + 14 + 24 + 24 + 28 = 165mm。
      // autoTable はテーブルの罫線・パディングを含めてオーバーフロー判定するため、
      // A4 利用可能幅 180mm（210 - marginX×2）に対して最低でも 10mm 以上の
      // 余裕を持たせる必要がある。175mm（5mm 余裕）だと autoTable が自動縮小を
      // 発動し（"X units width could not fit page" 警告）、CJK 幅計算とのズレで
      // 中間行が消えるバグが再発する。165mm（15mm 余裕）でこれを回避する。
      0: { cellWidth: 75 },
      1: { cellWidth: 14, halign: "right" },
      2: { cellWidth: 24, halign: "right" },
      3: { cellWidth: 24, halign: "right" },
      4: { cellWidth: 28, halign: "right" },
    },
  });

  return getLastAutoTableFinalY(doc) + 4;
}
