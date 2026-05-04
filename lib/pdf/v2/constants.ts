// PDF レイアウト定数。A4 縦想定。

export const PAGE = {
  format: "a4" as const,
  unit: "mm" as const,
  marginX: 15,
  marginTop: 20,
  marginBottom: 25,
};

// 色は jsPDF の RGB 配列（0〜255）で保持。
export const COLORS = {
  primary: [33, 64, 95] as [number, number, number],
  gray: [100, 100, 100] as [number, number, number],
  light: [240, 240, 240] as [number, number, number],
  black: [30, 30, 30] as [number, number, number],
};

export const FONT_SIZE = {
  title: 18,
  section: 11,
  body: 9,
  small: 8,
  pageNumber: 8,
};

// 日本語フォント名（registerJapaneseFont 後に setFont で参照する識別子）
export const FONT_FAMILY = "NotoSansJP";
