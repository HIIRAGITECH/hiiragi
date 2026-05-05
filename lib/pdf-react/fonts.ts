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
  // CJK は単語区切りの空白がないため、react-pdf 内部の line break が
  // 「1 トークン丸ごと」を改行できないとみなし長文が右にはみ出すことがある。
  // 一方で `Array.from(word)` で全文字を分割すると、ASCII 半角スペースなど
  // 非 CJK 文字も 1 文字単位の syllable になり、line breaker が空白を glue として
  // 折り畳んで出力から脱落させるケースが発生する（実測で確認）。
  //
  // そのため:
  //   - CJK 文字を含まないトークン（半角英数のみ・空白のみ）は触らずそのまま返す
  //   - CJK と非 CJK が混在するトークンは、CJK 文字 1 つを 1 chunk、
  //     連続する非 CJK 文字（ASCII 半角スペースを含む）を 1 chunk にまとめる
  //   これで CJK 部分は 1 文字単位で改行可能、非 CJK ランは中間で切れず空白も保持される。
  Font.registerHyphenationCallback((word) => {
    const cjk = /[　-鿿＀-￯]/;
    if (!cjk.test(word)) return [word];
    const parts: string[] = [];
    let buffer = "";
    for (const ch of word) {
      if (cjk.test(ch)) {
        if (buffer !== "") {
          parts.push(buffer);
          buffer = "";
        }
        parts.push(ch);
      } else {
        buffer += ch;
      }
    }
    if (buffer !== "") parts.push(buffer);
    return parts;
  });
  registered = true;
}
