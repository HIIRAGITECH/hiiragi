import { Font } from "@react-pdf/renderer";
import { join } from "node:path";

// react-pdf 用の NotoSansJP 登録。サーバーサイド（route handler）専用。
//
// 重要: TTF ではなく OTF (CFF) を使う。
//   pdfkit の subset embed は TTF だと CIDFontType2 + CIDToGIDMap=Identity を出力するが、
//   サブセット内のグリフ並びとそれに合わせた CIDToGIDMap の整合がうまく行かず、
//   Adobe Reader 等の PC 向けビューアで先頭グリフが別文字（"&" 等）に化ける問題があった
//   （ブラウザ内蔵ビューアでは glyph 描画が正常）。
//   OTF を渡すと pdfkit は CIDFontType0 + FontFile3 (CIDFontType0C) として埋め込み、
//   CFF 内部の CID マッピングを直接使うため Adobe を含む各ビューアで正しく表示される。
let registered = false;

export function registerJapaneseFont(): void {
  if (registered) return;
  const fontDir = join(process.cwd(), "public", "fonts");
  Font.register({
    family: "NotoSansJP",
    fonts: [
      {
        src: join(fontDir, "NotoSansJP-Regular.otf"),
        fontWeight: "normal",
      },
      {
        src: join(fontDir, "NotoSansJP-Bold.otf"),
        fontWeight: "bold",
      },
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
