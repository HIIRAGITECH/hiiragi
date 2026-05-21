-- 原価フィールド追加（粗利管理 Step 1）
-- - work_menu_items: labor_cost_price / parts_cost_price を追加（NOT NULL DEFAULT 0）
-- - orders.items (jsonb): 各要素に labor_cost_price / parts_cost_price を 0 でバックフィル
-- 既存データへの影響: なし（原価=0 なので売価・粗利計算は従来通り、粗利=売上 となる）
-- 冪等性: ADD COLUMN IF NOT EXISTS / 既キー存在チェックで再実行可。
--
-- 本番 DB へは Supabase ダッシュボード or CLI から手動適用すること（開発のみ自動適用）。

-- ============================================
-- 1) work_menu_items に原価カラム追加
-- ============================================
ALTER TABLE work_menu_items
  ADD COLUMN IF NOT EXISTS labor_cost_price numeric NOT NULL DEFAULT 0;
ALTER TABLE work_menu_items
  ADD COLUMN IF NOT EXISTS parts_cost_price numeric NOT NULL DEFAULT 0;

-- ============================================
-- 2) orders.items の各要素に原価フィールドを 0 でバックフィル
--    WITH ORDINALITY で元の配列順序を保持する。
--    既に labor_cost_price / parts_cost_price を持つ要素はそのまま残す（冪等）。
-- ============================================
UPDATE orders o
SET items = COALESCE(sub.new_items, '[]'::jsonb)
FROM (
  SELECT
    o2.id AS order_id,
    jsonb_agg(
      CASE
        WHEN elem ? 'labor_cost_price' AND elem ? 'parts_cost_price' THEN elem
        ELSE elem
          || jsonb_build_object(
               'labor_cost_price',
               COALESCE(elem -> 'labor_cost_price', to_jsonb(0)),
               'parts_cost_price',
               COALESCE(elem -> 'parts_cost_price', to_jsonb(0))
             )
      END
      ORDER BY ord
    ) AS new_items
  FROM orders o2,
       LATERAL jsonb_array_elements(o2.items) WITH ORDINALITY AS t(elem, ord)
  WHERE jsonb_typeof(o2.items) = 'array'
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(o2.items) e
      WHERE NOT (e ? 'labor_cost_price') OR NOT (e ? 'parts_cost_price')
    )
  GROUP BY o2.id
) sub
WHERE o.id = sub.order_id;
