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
  // 一方で `Array.from(word)` で全文字を分割すると半角スペースまで 1 文字単位の
  // syllable になり、textkit の line breaker が空白を glue として折り畳む過程で
  // ASCII / CJK 境界の空白が出力から脱落する事象があった
  //   （例: "No.2603-033 水戸..." → "No.2603-033水戸..."）。
  //
  // 対策として「半角スペース」「CJK 1 文字」「連続する非 CJK 文字（英数記号）」を
  // 互いに独立した chunk に分けて返す。半角スペースを単独 chunk にすることで
  // ASCII 連続ランや CJK 文字に紛れ込んで消えることがなくなる。
  // CJK が 1 文字も含まれない単語は分割不要なのでそのまま返す（既定動作維持）。
  const cjk = /[　-鿿＀-￯]/;
  Font.registerHyphenationCallback((word) => {
    if (!cjk.test(word)) return [word];
    const parts: string[] = [];
    let buffer = "";
    const flush = () => {
      if (buffer !== "") {
        parts.push(buffer);
        buffer = "";
      }
    };
    for (const ch of word) {
      if (cjk.test(ch)) {
        flush();
        parts.push(ch);
      } else if (ch === " ") {
        flush();
        parts.push(ch);
      } else {
        buffer += ch;
      }
    }
    flush();
    return parts;
  });
  registered = true;
}
