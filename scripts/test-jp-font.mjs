// 動作確認用スクリプト: NotoSansJP を埋め込んだ日本語 PDF を
// .tmp/jp-font-test.pdf に書き出す。
//
// 実行: node scripts/test-jp-font.mjs
// PDF が生成され、サイズが妥当（約 500KB 〜 数 MB）なら成功。

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { jsPDF } from "jspdf";

import {
  notoSansJPRegularBase64,
  notoSansJPBoldBase64,
} from "../lib/pdf/fonts/noto-sans-jp.ts";

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, ".tmp");
const OUT_PATH = join(OUT_DIR, "jp-font-test.pdf");

mkdirSync(OUT_DIR, { recursive: true });

const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

doc.addFileToVFS("NotoSansJP-Regular.ttf", notoSansJPRegularBase64);
doc.addFont("NotoSansJP-Regular.ttf", "NotoSansJP", "normal");
doc.addFileToVFS("NotoSansJP-Bold.ttf", notoSansJPBoldBase64);
doc.addFont("NotoSansJP-Bold.ttf", "NotoSansJP", "bold");

doc.setFont("NotoSansJP", "bold");
doc.setFontSize(20);
doc.text("日本語フォント埋め込みテスト", 105, 30, { align: "center" });

doc.setFont("NotoSansJP", "normal");
doc.setFontSize(12);
const lines = [
  "見積書 / 請求書",
  "株式会社サンプル整備工場",
  "東京都千代田区丸の内1-2-3",
  "TEL: 03-1234-5678",
  "ご請求金額: ￥123,456 円（税込）",
  "備考: ブレーキパッド交換・オイル交換・タイヤローテーション",
  "ひらがな: あいうえお かきくけこ さしすせそ",
  "カタカナ: アイウエオ カキクケコ サシスセソ",
  "漢字: 永遠龍鬱魅薔薇曖昧檸檬醤油",
  "数字記号: 0123456789 ¥%&#@!?",
];
let y = 50;
for (const line of lines) {
  doc.text(line, 20, y);
  y += 8;
}

doc.setFont("NotoSansJP", "bold");
doc.setFontSize(14);
doc.text("太字テスト：見積書", 20, y + 10);

const pdfBuf = Buffer.from(doc.output("arraybuffer"));
writeFileSync(OUT_PATH, pdfBuf);

const sizeKb = (pdfBuf.length / 1024).toFixed(1);
console.log("PDF 生成完了:", OUT_PATH);
console.log("  サイズ:", sizeKb, "KB");

if (pdfBuf.length < 100 * 1024) {
  console.error("⚠️ サイズが小さすぎます（100KB未満）。フォントが埋め込めていない可能性があります。");
  process.exit(1);
}
