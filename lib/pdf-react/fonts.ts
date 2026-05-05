import { Font } from "@react-pdf/renderer";
import { join } from "node:path";

// react-pdf 用の日本語フォント登録。サーバーサイド（route handler）専用。
//
// 経緯（「&」グリフ化け問題）:
//   - NotoSansJP（TTF / OTF）でも IPAex Gothic でも、Adobe Reader で
//     ダウンロード PDF を開いたときに先頭グリフが "&" に化ける現象が発生。
//   - 同じ Font.register（絶対パス）を直接スクリプトから呼んで生成した PDF では
//     再現せず、route handler 経由（InvoiceDocument 経由）の出力でのみ発生する。
//   - 唯一の差分が「同じ TTF を normal / bold の 2 ウェイトで重複登録している点」
//     だったため、bold 登録を取りやめ Regular のみを登録する形に戻す。
//     ipaexg.ttf は元々 Bold ウェイトを持たないため、bold 指定箇所は
//     react-pdf の resolve で Regular に fallback される（見た目は変わらない）。
//
// InvoiceDocument 側との互換性のため `family: "NotoSansJP"` の名前は据え置き。
let registered = false;

export function registerJapaneseFont(): void {
  if (registered) return;
  const fontDir = join(process.cwd(), "public", "fonts");
  const ipaex = join(fontDir, "ipaexg.ttf");
  // 同一ファイルの bold 重複登録は subset を 2 系統作って Adobe Reader で
  // CMap がずれる原因になり得るため避ける。SingleLoad 形式 1 回だけ登録する。
  Font.register({
    family: "NotoSansJP",
    src: ipaex,
    fontWeight: "normal",
  });
  // CJK は単語区切りの空白がないため、デフォルトの hyphenation だと「1 トークン
  // 丸ごと」が改行できないとみなされ長文が右にはみ出す。1 文字ずつ syllable に
  // 分割することで CJK 文字単位の折り返しを可能にする。
  Font.registerHyphenationCallback((word) => Array.from(word));
  registered = true;
}
