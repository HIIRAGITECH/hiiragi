import { Font } from "@react-pdf/renderer";
import { join } from "node:path";

// react-pdf 用の NotoSansJP 登録。サーバーサイド（route handler）専用。
// public/fonts/ の TTF を fontkit.open（@react-pdf/font 内部で利用）で読み込ませる。
// 多重登録防止のためフラグで一度だけ実行する。
let registered = false;

export function registerJapaneseFont(): void {
  if (registered) return;
  const fontDir = join(process.cwd(), "public", "fonts");
  Font.register({
    family: "NotoSansJP",
    fonts: [
      {
        src: join(fontDir, "NotoSansJP-Regular.ttf"),
        fontWeight: "normal",
      },
      {
        src: join(fontDir, "NotoSansJP-Bold.ttf"),
        fontWeight: "bold",
      },
    ],
  });
  // ハイフネーションコールバック。
  //
  // 経緯:
  //   旧実装は「CJK と 非 CJK が混在するトークンを CJK 1 文字 / ASCII ラン / 半角スペース
  //   の chunk に分けて返す」方式をとっていたが、subset 化された日本語フォントを
  //   PDF に埋め込んだとき、Adobe Reader 等の PC 向け PDF ビューアで chunk 先頭の
  //   1 グリフが "&" に置換される現象が発生した（ブラウザ内蔵ビューアでは正常）。
  //   chunk の組み方によって fontkit の subset / CMap 生成に影響する可能性が高いと判断。
  //
  // 対策:
  //   chunk 分割を辞めて 1 文字ずつ syllable にする最も単純な形にする。
  //   これで multi-char chunk 起因の「&」置換バグは解消する。CJK 文字単位の
  //   折り返しもそのまま効くため、長文品名の右はみ出しも引き続き発生しない。
  //   ASCII 単語が単語の途中で改行されうる弱点は残るが、本プロジェクトの明細欄は
  //   95mm 程度確保しており実害は小さい。
  Font.registerHyphenationCallback((word) => Array.from(word));
  registered = true;
}
