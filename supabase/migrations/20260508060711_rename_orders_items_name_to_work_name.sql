-- orders.items (jsonb) 内の各要素のキー "name" を "work_name" にリネームする。
-- 配列内全要素を走査し、name キーがあって work_name が無い要素のみ書き換える（冪等）。
-- 行数・id は保持し、name 以外のキー（quantity / unit_price / labor_cost /
-- parts_cost / type / tax_free 等）はすべてそのまま残す。
--
-- 本番 DB へは Supabase ダッシュボード or CLI から手動適用すること。

UPDATE orders
SET items = (
  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN elem ? 'name' AND NOT (elem ? 'work_name')
        THEN (elem - 'name') || jsonb_build_object('work_name', elem->'name')
      ELSE elem
    END
  ), '[]'::jsonb)
  FROM jsonb_array_elements(items) elem
)
WHERE jsonb_typeof(items) = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(items) e
    WHERE e ? 'name'
  );
