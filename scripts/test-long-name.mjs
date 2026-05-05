// 長い日本語品名が autoTable のセル内で折り返されたとき、
// 中間行が描画から漏れていないか検証するスクリプト。
//
// 主判定: didDrawCell フックで取得した折り返し後の行配列を結合して
//         入力文字列と一致するか確認（文字の脱落を直接検出）。
// 補助:   pdf-parse で抽出したテキストにも含まれるか（CJK は jsPDF 側の
//         ToUnicode CMap 未埋め込みで抽出が空になることがあるため warn のみ）。

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { createRequire } from "node:module";

// pdf-parse は CJS で default 解決が ESM 経由だと失敗するため createRequire で読み込む
const require = createRequire(import.meta.url);

// register.ts を経由すると Node の TypeScript stripping が
// 内部相対 import (`./noto-sans-jp`) を解決できないため、フォント定義を直接読み込む。
import {
  notoSansJPRegularBase64,
  notoSansJPBoldBase64,
} from "../lib/pdf/fonts/noto-sans-jp.ts";

function registerJapaneseFont(doc) {
  doc.addFileToVFS("NotoSansJP-Regular.ttf", notoSansJPRegularBase64);
  doc.addFont("NotoSansJP-Regular.ttf", "NotoSansJP", "normal");
  doc.addFileToVFS("NotoSansJP-Bold.ttf", notoSansJPBoldBase64);
  doc.addFont("NotoSansJP-Bold.ttf", "NotoSansJP", "bold");
  doc.setFont("NotoSansJP", "normal");
}

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, ".tmp");
const OUT_PATH = join(OUT_DIR, "long-name-test.pdf");
mkdirSync(OUT_DIR, { recursive: true });

// 検証対象の長い品名（実データから抜粋）
const longNames = [
  "No.2603-033 水戸2りんかん様 SHOWAツインショック(SC54)",
  "No.2604-026 ・・・/OHLINSツインショック",
  "No.2603-052 短い品名",
];

// items-table.ts の autoTable オプションと同じ設定で検証する
const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
registerJapaneseFont(doc);

const cellLogs = [];

// autoTable は "Of the table content, X units width could not fit page" 系の
// 警告を出す。jsPDF/jspdf-autotable は console.warn / console.error / console.log の
// いずれを使うか version によって異なるため 3 系統すべて hook して捕捉する。
const capturedLogs = [];
const originalWarn = console.warn;
const originalError = console.error;
const originalLog = console.log;
console.warn = (...args) => {
  capturedLogs.push({
    method: "warn",
    text: args.map((a) => String(a)).join(" "),
  });
  originalWarn(...args);
};
console.error = (...args) => {
  capturedLogs.push({
    method: "error",
    text: args.map((a) => String(a)).join(" "),
  });
  originalError(...args);
};
console.log = (...args) => {
  capturedLogs.push({
    method: "log",
    text: args.map((a) => String(a)).join(" "),
  });
};

autoTable(doc, {
  startY: 20,
  head: [["品名", "数量", "工賃", "部品代", "小計"]],
  body: longNames.map((name) => [name, "1", "¥10,000", "—", "¥10,000"]),
  showHead: "everyPage",
  rowPageBreak: "auto",
  margin: { left: 15, right: 15, top: 25, bottom: 25 },
  styles: {
    font: "NotoSansJP",
    fontStyle: "normal",
    fontSize: 9,
    cellPadding: 2,
    overflow: "linebreak",
    valign: "top",
    lineColor: [200, 200, 200],
    lineWidth: 0.1,
    textColor: [30, 30, 30],
  },
  headStyles: {
    font: "NotoSansJP",
    fontStyle: "bold",
    fillColor: [33, 64, 95],
    textColor: [255, 255, 255],
    halign: "center",
  },
  bodyStyles: { minCellHeight: 0 },
  columnStyles: {
    // items-table.ts と完全一致させる（合計 180mm = 利用可能幅と一致）
    0: { cellWidth: 95 },
    1: { cellWidth: 12, halign: "right" },
    2: { cellWidth: 22, halign: "right" },
    3: { cellWidth: 22, halign: "right" },
    4: { cellWidth: 29, halign: "right" },
  },
  didDrawCell: (data) => {
    if (data.section === "body" && data.column.index === 0) {
      const cellText = data.cell.text;
      const lines = Array.isArray(cellText)
        ? cellText.map((s) => String(s))
        : [String(cellText)];
      cellLogs.push({
        rowIndex: data.row.index,
        lines,
        height: data.cell.height,
      });
    }
  },
});

// autoTable の実行が終わったので hook を元に戻す
console.warn = originalWarn;
console.error = originalError;
console.log = originalLog;

const buf = Buffer.from(doc.output("arraybuffer"));
writeFileSync(OUT_PATH, buf);
console.log(`PDF 生成完了: ${OUT_PATH}`);
console.log(`  サイズ: ${(buf.length / 1024).toFixed(1)} KB`);

let mainOk = true;

console.log("\n--- autoTable の警告ログ捕捉 ---");
// "could not fit page" を含む警告が捕捉されたら無条件で fail。
const fitWarning = capturedLogs.find((l) => /could not fit page/.test(l.text));
if (fitWarning) {
  console.error(
    `❌ autoTable オーバーフロー警告: [${fitWarning.method}] "${fitWarning.text}"`,
  );
  console.error(
    "   columnStyles 合計が A4 利用可能幅 180mm との差分 0 でないため警告発生。",
  );
  mainOk = false;
} else {
  console.log("✓ autoTable のオーバーフロー警告は出ていません");
}

console.log(
  "\n--- 主判定: didDrawCell の cell.text 行配列を結合して入力と一致するか ---",
);
for (let i = 0; i < longNames.length; i++) {
  const original = longNames[i];
  const log = cellLogs[i];
  if (!log) {
    console.error(`❌ Row ${i}: didDrawCell ログが取れませんでした`);
    mainOk = false;
    continue;
  }
  const joined = log.lines.join("");
  // 空白を無視して比較。autoTable は折り返し位置の半角スペースを
  // 行末/行頭で trim するため、結合では空白がズレるが文字脱落ではない。
  // 中間行の消失は「非空白文字の不一致」として確実に検出される。
  const normalize = (s) => s.replace(/\s+/g, "");
  if (normalize(joined) !== normalize(original)) {
    console.error(`❌ Row ${i} 文字脱落:`);
    console.error(`   input : "${original}"`);
    console.error(`   parsed: "${joined}"`);
    console.error(`   lines : ${JSON.stringify(log.lines)}`);
    console.error(`   height: ${log.height.toFixed(2)}mm`);
    mainOk = false;
  } else {
    const note =
      joined === original
        ? ""
        : "（折り返し位置の半角スペース trim、内容は完全保持）";
    console.log(
      `✓ Row ${i}: ${log.lines.length} 行 / 高さ ${log.height.toFixed(2)}mm${note}`,
    );
    log.lines.forEach((l, j) => console.log(`     [${j}] "${l}"`));
  }
}

console.log("\n--- 補助: pdf-parse で PDF からテキスト抽出 ---");
try {
  // pdf-parse は CJS module.exports = function でも { default: function } でも提供される可能性
  const mod = require("pdf-parse");
  const pdfParse = typeof mod === "function" ? mod : (mod.default ?? mod);
  if (typeof pdfParse !== "function") {
    throw new Error("pdf-parse module shape unexpected");
  }
  const parsed = await pdfParse(buf);
  const text = parsed.text ?? "";
  if (!text.trim()) {
    console.warn(
      "⚠️ pdf-parse は空文字を返しました（jsPDF が ToUnicode CMap を埋め込まないため CJK 抽出不可なのは仕様）",
    );
  } else {
    for (const name of longNames) {
      if (text.includes(name)) {
        console.log(`✓ pdf-parse から検出: ${name}`);
      } else {
        console.warn(`⚠️ pdf-parse では検出できず: ${name}`);
      }
    }
  }
} catch (err) {
  console.warn(
    "⚠️ pdf-parse で例外（補助判定なので続行）:",
    err instanceof Error ? err.message : err,
  );
}

if (!mainOk) {
  console.error(
    "\n❌ 品名の折り返し結果が入力と一致しません。中間行の脱落あり。",
  );
  process.exit(1);
}
console.log(
  "\n✓ すべての品名が autoTable のセルに完全に保持されています（中間行の脱落なし）",
);
