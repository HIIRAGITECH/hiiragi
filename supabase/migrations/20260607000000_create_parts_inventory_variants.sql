-- Step 3-1: 車種別定価テーブル parts_inventory_variants を新設する。
--
-- 設計の到達点 (DECISIONS.md「Step 3」参照):
--   部品(parts_inventory)は寸法で1行のまま (在庫を割らない)。その部品に
--   「品番＋定価＋適合車種タグ」の組 (variant) を複数ぶら下げる 1対多。
--   仕入れは寸法 (一番安い品番)、請求は車種 (その車の variant の定価)、
--   品番は発注・廃番管理用。3つの軸は役割が違うだけで競合しない。
--
-- 今回の範囲:
--   テーブル新設のみ。UI (ピッカー車種版・明細への流し込み・variant編集) は次ステップ。
--   既存テーブル・データには触らない。加算的変更のみ。
--
-- データ構造の判断:
--   - vehicle_tags は text[] (案A)。車種マスターは作らず、ゆれは別途吸収
--     (DECISIONS.md「車種の表記ゆれ対策」参照)。将来必要なら正規化に育てる。
--   - 親 parts_inventory が消えたら variant も消える (CASCADE)。組のソフトデリートは
--     variant 側 deleted_at でも別途可能。
--   - 車種照合は配列の包含演算子 (vehicle_tags @> ARRAY['XX']) を使う前提で GIN を張る。
--
-- RLS / トリガ:
--   既存 parts_inventory と同じ流儀 (user_id = auth.uid() の単純ポリシー4本) に揃える。
--   updated_at は既存の public.touch_updated_at() トリガを流用。
--
-- 本番 DB へは Supabase ダッシュボード or CLI から手動適用すること。

BEGIN;

CREATE TABLE IF NOT EXISTS public.parts_inventory_variants (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  part_id        uuid NOT NULL REFERENCES public.parts_inventory(id) ON DELETE CASCADE,
  part_number    text,
  list_price     numeric,
  vehicle_tags   text[] NOT NULL DEFAULT '{}'::text[],
  maker          text,
  note           text,
  display_order  integer NOT NULL DEFAULT 0,
  deleted_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- 親 → variant 引き (受注詳細などで頻発する想定)
CREATE INDEX IF NOT EXISTS parts_inventory_variants_part_idx
  ON public.parts_inventory_variants(part_id);

-- 活性行のみ高速に絞り込む (ピッカーなどで deleted_at IS NULL を多用するため)
CREATE INDEX IF NOT EXISTS parts_inventory_variants_user_active_idx
  ON public.parts_inventory_variants(user_id) WHERE deleted_at IS NULL;

-- 車種タグの配列包含検索 (vehicle_tags @> ARRAY['グース'] など)
CREATE INDEX IF NOT EXISTS parts_inventory_variants_vehicle_tags_gin
  ON public.parts_inventory_variants USING GIN (vehicle_tags);

ALTER TABLE public.parts_inventory_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY parts_inventory_variants_owner_select ON public.parts_inventory_variants
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY parts_inventory_variants_owner_insert ON public.parts_inventory_variants
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY parts_inventory_variants_owner_update ON public.parts_inventory_variants
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY parts_inventory_variants_owner_delete ON public.parts_inventory_variants
  FOR DELETE USING (user_id = auth.uid());

CREATE TRIGGER parts_inventory_variants_touch_updated_at
  BEFORE UPDATE ON public.parts_inventory_variants
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

COMMIT;
