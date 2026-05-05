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

// autoTable が "Of the table content, X units width could not fit page" のような
// 警告を console.log で出力するので、autoTable 実行中だけ console.log を hook して
// 捕捉する。捕捉した警告はテストの主判定にも反映する。
const capturedLogs = [];
const originalLog = console.log;
console.log = (...args) => {
  capturedLogs.push(args.map((a) => String(a)).join(" "));
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
    // items-table.ts と完全一致させる（合計 165mm）
    0: { cellWidth: 75 },
    1: { cellWidth: 14, halign: "right" },
    2: { cellWidth: 24, halign: "right" },
    3: { cellWidth: 24, halign: "right" },
    4: { cellWidth: 28, halign: "right" },
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

// autoTable の実行が終わったので console.log を元に戻す
console.log = originalLog;

const buf = Buffer.from(doc.output("arraybuffer"));
writeFileSync(OUT_PATH, buf);
console.log(`PDF 生成完了: ${OUT_PATH}`);
console.log(`  サイズ: ${(buf.length / 1024).toFixed(1)} KB`);

let mainOk = true;

console.log("\n--- autoTable の警告ログ捕捉 ---");
// jspdf-autotable v5 のソース上、resizeWidth = |利用可能幅 - テーブル幅| が
// 0.1/scaleFactor を超えると常に警告が出る。つまり「余ってる時」も出る。
// 全列 customWidth なら resizableColumns が空なので自動縮小は発動しない。
// 「中間行が消える」のは self-healing の自動縮小が customWidth 列を
// 縮めようとした時に起こる。本実装は全列 customWidth なのでそのケースはない。
// よって判定は「overflow 値が 10mm 未満なら fail」に緩める：
//   <10mm → 自動縮小トリガまでの余裕が足りず CJK 幅計算ズレで再発しうる
//   >=10mm → 設計通りの余裕（実害なし、警告は出るが）
const fitWarning = capturedLogs.find((l) => /could not fit page/.test(l));
if (fitWarning) {
  const m = fitWarning.match(/(\d+(?:\.\d+)?)\s*units/);
  const overflow = m ? Number.parseFloat(m[1]) : Number.POSITIVE_INFINITY;
  if (overflow < 10) {
    console.error(
      `❌ autoTable オーバーフロー警告（実害あり）: "${fitWarning}"`,
    );
    console.error(
      `   overflow=${overflow}mm < 10mm。CJK 幅計算ズレで中間行欠落の可能性`,
    );
    mainOk = false;
  } else {
    console.log(
      `⚠️ autoTable 余裕警告（実害なし）: "${fitWarning}" (overflow=${overflow}mm)`,
    );
    console.log(
      "   全列 customWidth のため自動縮小は発動せず、設計通りの余裕です",
    );
  }
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
