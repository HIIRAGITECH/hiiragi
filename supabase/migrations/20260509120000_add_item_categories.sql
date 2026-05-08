-- 業務カテゴリ（ユーザー定義）の DB スキーマ追加と、既存データのバックフィル。
--
-- 設計:
--   tax_category (システム固定)  : 'taxable' | 'shaken_non_tax'
--   item_category_id (ユーザー定義): work_item_categories への参照
--
-- 移行ポリシー:
--   既存の work_menu_items.category と orders.items の type/tax_free は残したまま、
--   新カラムを並走させる。Step 6-2 以降で計算ロジックの切替が完了してから旧カラムを削除する。
--
-- ロールバック手順（緊急時の参考。本番には触れない前提）:
--   ALTER TABLE work_menu_items DROP COLUMN IF EXISTS item_category_id;
--   ALTER TABLE work_menu_items DROP COLUMN IF EXISTS tax_category;
--   DROP TABLE IF EXISTS work_item_categories CASCADE;
--   -- orders.items から新キー除去:
--   UPDATE orders SET items = (
--     SELECT jsonb_agg(elem - 'tax_category' - 'item_category_id')
--     FROM jsonb_array_elements(items) elem
--   ) WHERE jsonb_typeof(items) = 'array';

-- ============================================
-- ステップ 1: work_item_categories テーブル作成
-- ============================================
CREATE TABLE IF NOT EXISTS work_item_categories (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_system     boolean NOT NULL DEFAULT false,
  deleted_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS work_item_categories_user_order_idx
  ON work_item_categories(user_id, display_order);
CREATE INDEX IF NOT EXISTS work_item_categories_user_active_idx
  ON work_item_categories(user_id, deleted_at)
  WHERE deleted_at IS NULL;

ALTER TABLE work_item_categories ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY work_item_categories_owner_select ON work_item_categories
    FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY work_item_categories_owner_insert ON work_item_categories
    FOR INSERT WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY work_item_categories_owner_update ON work_item_categories
    FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY work_item_categories_owner_delete ON work_item_categories
    FOR DELETE USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER work_item_categories_touch_updated_at
    BEFORE UPDATE ON work_item_categories
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================
-- ステップ 2: work_menu_items に新カラム
-- ============================================
ALTER TABLE work_menu_items
  ADD COLUMN IF NOT EXISTS tax_category text NOT NULL DEFAULT 'taxable';

DO $$ BEGIN
  ALTER TABLE work_menu_items
    ADD CONSTRAINT work_menu_items_tax_category_check
    CHECK (tax_category IN ('taxable', 'shaken_non_tax'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE work_menu_items
  ADD COLUMN IF NOT EXISTS item_category_id uuid
    REFERENCES work_item_categories(id) ON DELETE SET NULL;

-- ============================================
-- ステップ 3: 各ユーザーに初期カテゴリを seed（冪等）
-- ============================================
INSERT INTO work_item_categories (user_id, name, display_order, is_system)
SELECT u.id, '整備', 1, true FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM work_item_categories wic
  WHERE wic.user_id = u.id AND wic.name = '整備'
);
INSERT INTO work_item_categories (user_id, name, display_order, is_system)
SELECT u.id, '車検整備', 2, true FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM work_item_categories wic
  WHERE wic.user_id = u.id AND wic.name = '車検整備'
);
INSERT INTO work_item_categories (user_id, name, display_order, is_system)
SELECT u.id, '車検法定費用', 3, true FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM work_item_categories wic
  WHERE wic.user_id = u.id AND wic.name = '車検法定費用'
);

-- ============================================
-- ステップ 4: work_menu_items のバックフィル
-- ============================================
UPDATE work_menu_items wmi
SET
  tax_category = CASE
    WHEN wmi.category = 'shaken_tax_free' THEN 'shaken_non_tax'
    ELSE 'taxable'
  END,
  item_category_id = (
    SELECT wic.id
    FROM work_item_categories wic
    WHERE wic.user_id = wmi.user_id
      AND wic.name = CASE
        WHEN wmi.category = 'normal'          THEN '整備'
        WHEN wmi.category = 'shaken'          THEN '車検整備'
        WHEN wmi.category = 'shaken_tax_free' THEN '車検法定費用'
      END
    LIMIT 1
  )
WHERE wmi.item_category_id IS NULL;

-- ============================================
-- ステップ 5: orders.items 各要素のバックフィル
-- ============================================
UPDATE orders o
SET items = (
  SELECT COALESCE(
    jsonb_agg(
      CASE
        WHEN elem ? 'tax_category' THEN elem
        ELSE elem || jsonb_build_object(
          'tax_category',
          CASE
            WHEN COALESCE((elem->>'tax_free')::boolean, false) THEN 'shaken_non_tax'
            ELSE 'taxable'
          END,
          'item_category_id',
          (
            SELECT wic.id::text
            FROM work_item_categories wic
            WHERE wic.user_id = o.user_id
              AND wic.name = CASE
                WHEN elem->>'type' = 'shaken'
                     AND COALESCE((elem->>'tax_free')::boolean, false) IS TRUE
                  THEN '車検法定費用'
                WHEN elem->>'type' = 'shaken' THEN '車検整備'
                ELSE '整備'
              END
            LIMIT 1
          )
        )
      END
      ORDER BY ord
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(o.items) WITH ORDINALITY AS t(elem, ord)
)
WHERE jsonb_typeof(o.items) = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(o.items) e
    WHERE NOT (e ? 'tax_category')
  );
