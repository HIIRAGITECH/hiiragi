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
  // カテゴリ見出し行の薄い背景
  categoryBand: [230, 235, 245] as [number, number, number],
  // テーブル罫線
  tableLine: [200, 200, 200] as [number, number, number],
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

// 明細テーブルのカテゴリ。printable-document.tsx の表記と完全一致させること。
export const CATEGORIES = [
  { key: "maintenance" as const, label: "整備" },
  { key: "shakenTaxable" as const, label: "車検（課税）" },
  { key: "shakenTaxFree" as const, label: "車検（非課税）" },
];

export type CategoryKey = (typeof CATEGORIES)[number]["key"];
