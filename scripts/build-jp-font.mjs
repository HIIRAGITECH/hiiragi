// 日本語フォント (NotoSansJP) を base64 化して
// lib/pdf/fonts/noto-sans-jp.ts として書き出すスクリプト。
// 入力フォントは .tmp/fonts/NotoSansJP-{Regular,Bold}.ttf を想定。
// 取得・変換手順:
//   1. OTF を取得
//      curl -L -o .tmp/fonts/NotoSansJP-Regular.otf https://github.com/notofonts/noto-cjk/raw/main/Sans/SubsetOTF/JP/NotoSansJP-Regular.otf
//      curl -L -o .tmp/fonts/NotoSansJP-Bold.otf    https://github.com/notofonts/noto-cjk/raw/main/Sans/SubsetOTF/JP/NotoSansJP-Bold.otf
//   2. TTF に変換 (jsPDF は CFF/OTF を一部しか解釈できないため TrueType outlines が必要)
//      pip install otf2ttf
//      python -c "from otf2ttf import main; main(['-o', '.tmp/fonts/NotoSansJP-Regular.ttf', '.tmp/fonts/NotoSansJP-Regular.otf'])"
//      python -c "from otf2ttf import main; main(['-o', '.tmp/fonts/NotoSansJP-Bold.ttf',    '.tmp/fonts/NotoSansJP-Bold.otf'])"

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const REG_PATH = join(ROOT, ".tmp", "fonts", "NotoSansJP-Regular.ttf");
const BOLD_PATH = join(ROOT, ".tmp", "fonts", "NotoSansJP-Bold.ttf");
const OUT_PATH = join(ROOT, "lib", "pdf", "fonts", "noto-sans-jp.ts");

// 必要ファイルが揃っているか検証
for (const p of [REG_PATH, BOLD_PATH]) {
  if (!existsSync(p)) {
    console.error(`フォントファイルが見つかりません: ${p}`);
    console.error(
      "以下のコマンドで .tmp/fonts/ にダウンロードしてください:\n" +
        "  curl -L -o .tmp/fonts/NotoSansJP-Regular.ttf https://github.com/notofonts/noto-cjk/raw/main/Sans/SubsetOTF/JP/NotoSansJP-Regular.ttf\n" +
        "  curl -L -o .tmp/fonts/NotoSansJP-Bold.ttf https://github.com/notofonts/noto-cjk/raw/main/Sans/SubsetOTF/JP/NotoSansJP-Bold.ttf",
    );
    process.exit(1);
  }
}

const regBuf = readFileSync(REG_PATH);
const boldBuf = readFileSync(BOLD_PATH);

const regBase64 = regBuf.toString("base64");
const boldBase64 = boldBuf.toString("base64");

const content =
  "/* eslint-disable */\n" +
  "// 自動生成。手で編集しないこと。\n" +
  "// 元フォント: Noto Sans JP (SIL Open Font License 1.1)\n" +
  "//   https://github.com/notofonts/noto-cjk\n" +
  "// 生成スクリプト: scripts/build-jp-font.mjs\n" +
  "\n" +
  `export const notoSansJPRegularBase64 = ${JSON.stringify(regBase64)};\n` +
  `export const notoSansJPBoldBase64 = ${JSON.stringify(boldBase64)};\n`;

writeFileSync(OUT_PATH, content, "utf8");

const sizeMb = (s) => (s / (1024 * 1024)).toFixed(2);
console.log("生成完了:", OUT_PATH);
console.log("  Regular OTF:", sizeMb(regBuf.length), "MB ->", sizeMb(regBase64.length), "MB (base64)");
console.log("  Bold    OTF:", sizeMb(boldBuf.length), "MB ->", sizeMb(boldBase64.length), "MB (base64)");
console.log("  出力ファイルサイズ:", sizeMb(content.length), "MB");
