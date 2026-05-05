import { Font } from "@react-pdf/renderer";
import { join } from "node:path";

// react-pdf 用の日本語フォント登録。サーバーサイド（route handler）専用。
//
// 経緯:
//   NotoSansJP（TTF も OTF も）を Font.register に渡すと、Adobe Reader 等の
//   PC 向け PDF ビューアで一部の文字が "&" などの別グリフに化ける現象が発生した
//   （ブラウザ内蔵ビューアと pdf-parse 抽出は正常）。
//   pdfkit/fontkit のサブセット化と NotoSansJP のグリフテーブルの組み合わせに
//   起因する問題と推測される。
//
// 対策:
//   IPAex Gothic (ipaexg.ttf) に切り替える。pdfkit との互換性が高く実績豊富で、
//   Adobe Reader でも安定して描画される。Bold ウェイトは無いため、bold 指定箇所は
//   Regular にフォールバックされる（同ファイルを bold として再登録）。
//
// InvoiceDocument 側との互換性のため `family: "NotoSansJP"` の名前は変えない。
let registered = false;

export function registerJapaneseFont(): void {
  if (registered) return;
  const fontDir = join(process.cwd(), "public", "fonts");
  const ipaex = join(fontDir, "ipaexg.ttf");
  Font.register({
    family: "NotoSansJP",
    fonts: [
      { src: ipaex, fontWeight: "normal" },
      { src: ipaex, fontWeight: "bold" },
    ],
  });
  // CJK は単語区切りの空白がないため、デフォルトの hyphenation だと「1 トークン
  // 丸ごと」が改行できないとみなされ長文が右にはみ出す。1 文字ずつ syllable に
  // 分割することで CJK 文字単位の折り返しを可能にする。
  // ASCII 単語も同じく文字単位で折れる可能性はあるが、明細欄を 95mm 確保している
  // ので実害は小さい。
  Font.registerHyphenationCallback((word) => Array.from(word));
  registered = true;
}
