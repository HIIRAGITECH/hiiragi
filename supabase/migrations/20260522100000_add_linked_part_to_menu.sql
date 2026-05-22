-- 作業メニューと部品マスターのリンクを追加（Step 3）。
-- 既存行は null のまま（手入力扱いで後方互換）。
-- 本番 DB へは Supabase ダッシュボード or CLI から手動適用すること。

ALTER TABLE work_menu_items
  ADD COLUMN IF NOT EXISTS linked_part_id uuid REFERENCES parts_inventory(id) ON DELETE SET NULL;

-- リンク検索用のインデックス（部品 → 紐づく作業メニュー逆引きに使用）。
-- 大半の行で null になる前提のため部分インデックスにする。
CREATE INDEX IF NOT EXISTS work_menu_items_linked_part_idx
  ON work_menu_items(linked_part_id) WHERE linked_part_id IS NOT NULL;
