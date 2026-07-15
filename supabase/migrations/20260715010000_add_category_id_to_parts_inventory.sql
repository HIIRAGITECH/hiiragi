-- 部品カテゴリ 段階2: parts_inventory に category_id を追加し、部品を部品カテゴリに紐付ける。
--
-- 位置づけ:
--   段階1で作った part_categories（自己参照ツリー・最大3階層・テナント別）を、部品本体(一階)に
--   1つ紐付ける。部品は「大／中／小のうちテナントが選んだ末端カテゴリ」を指す（途中階層で確定可）。
--   一覧のカテゴリ絞り込み・縦長解消は段階3（本マイグレでは器のみ）。
--
-- 加算的・後方互換:
--   - category_id は nullable。既存の全部品は category_id=NULL（未分類）のまま従来どおり動く。
--   - ADD COLUMN（nullable・デフォルトなし）は既存行を書き換えないメタデータのみの変更で安全。
--   - 二階建て(parts_inventory_variants)・在庫(stock_movements)・受注(orders)・PDF には影響しない。
--     カテゴリは部品本体の属性を1つ足すだけで、価格解決や在庫ロジックには一切関与しない。
--
-- 削除の守り（段階1からの申し送り）:
--   - ON DELETE SET NULL。カテゴリ(part_categories)を削除しても部品は壊れず、category_id が NULL に
--     戻る（＝未分類になるだけ）。part_categories はハード削除＋CASCADE(枝ごと)なので、親カテゴリを
--     消すと子孫カテゴリも消え、それらを指していた部品はすべて未分類に戻る。
--
-- GRANT:
--   parts_inventory は既に authenticated へ DML 付与済み。カラム追加はテーブル権限を継承するため
--   追加 GRANT 不要（新規テーブルではないため 42501 の懸念なし）。
--
-- 本番 DB へは Supabase SQL Editor から手動適用すること（DB先・コード後）。

BEGIN;

ALTER TABLE public.parts_inventory
  ADD COLUMN IF NOT EXISTS category_id uuid
    REFERENCES public.part_categories(id) ON DELETE SET NULL;

-- 段階3のカテゴリ絞り込み（user_id + category_id で活性部品を引く）に備えた部分インデックス。
-- 加算的で安全。段階2の動作には必須ではないが、ここで用意しておく。
CREATE INDEX IF NOT EXISTS parts_inventory_user_category_idx
  ON public.parts_inventory(user_id, category_id) WHERE deleted_at IS NULL;

COMMIT;
