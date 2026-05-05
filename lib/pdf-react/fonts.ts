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
  // CJK 文字を含むトークンに限り 1 文字ずつに分割して改行可能ポイントを増やし、
  // それ以外（半角英数のみのトークン）はハイフネーションを抑止して 1 トークンのまま扱う。
  Font.registerHyphenationCallback((word) => {
    if (/[　-鿿＀-￯]/.test(word)) {
      return Array.from(word);
    }
    return [word];
  });
  registered = true;
}
