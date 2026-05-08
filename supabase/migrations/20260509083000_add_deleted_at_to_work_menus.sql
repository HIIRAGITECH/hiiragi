-- 作業メニュー / 作業セットにソフトデリート用 deleted_at カラムを追加する。
-- NULL = アクティブ、timestamptz = 非表示化された時刻。
-- 既存行は deleted_at = NULL で初期化（影響なし）。
-- RLS ポリシーは現状のまま（user_id ベース）。
-- アプリ側で deleted_at IS NULL のフィルタを必要箇所に追加する。
--
-- 本番 DB へは Supabase ダッシュボード or CLI から手動適用すること。

-- ============================================
-- work_menu_items にソフトデリート列を追加
-- ============================================
ALTER TABLE work_menu_items
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 活性行（deleted_at IS NULL）の絞り込みを高速化する部分インデックス。
CREATE INDEX IF NOT EXISTS work_menu_items_user_active_idx
  ON work_menu_items(user_id, deleted_at)
  WHERE deleted_at IS NULL;

-- ============================================
-- work_menu_sets にソフトデリート列を追加
-- ============================================
ALTER TABLE work_menu_sets
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS work_menu_sets_user_active_idx
  ON work_menu_sets(user_id, deleted_at)
  WHERE deleted_at IS NULL;
