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
      // 列幅合計 95 + 12 + 22 + 22 + 29 = 180mm。
      // A4 (210mm) - marginX×2 (30mm) = 利用可能幅 180mm と「完全一致」させる。
      //
      // jspdf-autotable v5 のソース (dist/jspdf.plugin.autotable.js:205-224) を
      // 確認した結果、警告 "Of the table content, X units width could not fit page" は
      //   resizeWidth = Math.abs(利用可能幅 - テーブル幅)
      // が閾値 (0.1 / scaleFactor) を超えると常に出る仕様で、
      // 「テーブルがはみ出す時」だけでなく「テーブルが余る時」にも出る。
      // つまり列幅を縮めるほど警告数値はむしろ増える（175mm→5mm、165mm→15mm、
      // 155mm→25mm）。完全に消すには合計を利用可能幅と一致させる必要がある。
      //
      // また、全列 customWidth の場合 resizableColumns が空になるため
      // autoTable の自動縮小ロジックは発動せず、CJK 幅計算ズレによる中間行欠落も
      // 発生しない。180mm 一致で警告も消え、自動縮小も発動しない最良の構成。
      //
      // 増分は品名列に集中させる（長い品名の折り返し回数が減るほうがユーザー有利）。
      0: { cellWidth: 95 },
      1: { cellWidth: 12, halign: "right" },
      2: { cellWidth: 22, halign: "right" },
      3: { cellWidth: 22, halign: "right" },
      4: { cellWidth: 29, halign: "right" },
    },
  });

  return getLastAutoTableFinalY(doc) + 4;
}
