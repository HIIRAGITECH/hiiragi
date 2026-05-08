import type { OrderItem, WorkItemCategory } from "@/lib/types";

// PDF / HTML プレビュー / 売上集計で共有する「業務カテゴリ単位のセクション分け」ヘルパー。
//
// 入力: OrderItem[] と work_item_categories の一覧（display_order 昇順）。
// 出力: セクションの配列。並び順は次のとおり:
//   1. allCategories の display_order 順（中身が空のカテゴリは省く）
//   2. allCategories に存在しない id を参照する orphan 群（末尾）
//
// 旧 type/tax_free しか持たない既存データへの後方互換も含む（カテゴリ名で逆引き）。

export type OrderSection = {
  // 表示用の id（カテゴリ id 或いは "_orphan" 等）
  key: string;
  // 表示用カテゴリ名
  name: string;
  // allCategories に id が無い参照（理論上は無いが念のため）
  isOrphan: boolean;
  // allCategories にあるが deleted_at が立っているカテゴリ
  isDeleted: boolean;
  // is_system フラグ（標準カテゴリかどうか）
  isSystem: boolean;
  display_order: number;
  items: OrderItem[];
};

// 旧 type/tax_free からカテゴリ名を推定（item_category_id 欠損時のフォールバック用）。
function legacyCategoryNameFromOldFields(item: OrderItem): string {
  if (item.type === "shaken" && item.tax_free === true) return "車検法定費用";
  if (item.type === "shaken") return "車検整備";
  return "整備";
}

export function groupItemsByCategory(
  items: OrderItem[],
  allCategories: WorkItemCategory[],
): OrderSection[] {
  const byId = new Map(allCategories.map((c) => [c.id, c]));
  // 旧フィールド逆引き: 同名のアクティブカテゴリがあればその id を採用。
  // is_system カテゴリ（整備/車検整備/車検法定費用）は削除されないため通常見つかる。
  const byName = new Map(allCategories.map((c) => [c.name, c]));

  // bucket: id → items[]
  const buckets = new Map<string, OrderItem[]>();
  for (const it of items) {
    let key = it.item_category_id ?? "";
    if (!key) {
      const fallbackName = legacyCategoryNameFromOldFields(it);
      key = byName.get(fallbackName)?.id ?? "_orphan";
    }
    const list = buckets.get(key);
    if (list) list.push(it);
    else buckets.set(key, [it]);
  }

  const sections: OrderSection[] = [];
  const handled = new Set<string>();

  for (const c of allCategories) {
    const list = buckets.get(c.id);
    if (!list || list.length === 0) continue;
    sections.push({
      key: c.id,
      name: c.name,
      isOrphan: false,
      isDeleted: c.deleted_at !== null,
      isSystem: c.is_system,
      display_order: c.display_order,
      items: list,
    });
    handled.add(c.id);
  }
  for (const [key, list] of buckets) {
    if (handled.has(key)) continue;
    if (list.length === 0) continue;
    // allCategories に無い → orphan として末尾に。
    const cat = byId.get(key);
    sections.push({
      key,
      name: cat?.name ?? "（カテゴリ未分類）",
      isOrphan: !cat,
      isDeleted: cat?.deleted_at != null,
      isSystem: cat?.is_system ?? false,
      display_order: cat?.display_order ?? Number.MAX_SAFE_INTEGER,
      items: list,
    });
  }
  return sections;
}
