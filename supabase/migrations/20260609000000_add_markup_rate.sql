-- 業販対応 第二歩-1: マスターに掛け率(markup_rate)を持たせる。
--
-- 配置:
--   parts_inventory_variants.markup_rate ... variant(車種別定価)の業販掛け率。
--     業販価格は計算: variant.list_price * variant.markup_rate （DBには保存しない）。
--   work_menu_items.markup_rate        ... 作業メニュー工賃側の業販掛け率。
--     業販工賃は計算: work_menu_items.default_labor_cost * markup_rate （DBには保存しない）。
--
-- 値モデル:
--   numeric NULL（DEFAULT なし）。NULL = 「掛け率未設定」。
--   DB内部は小数 (0.95 = 95%)。UI で「%」入力/表示し、サーバー保存時に /100 する。
--   CHECK 制約は付けない (将来 120% など定価超えの業販もありうるため範囲を縛らない)。
--
-- 加算的のみ。既存データ・既存計算ロジック・受注明細・PDF には触らない。
-- 本番 DB へは Supabase ダッシュボード or CLI から手動適用すること。

BEGIN;

ALTER TABLE public.parts_inventory_variants
  ADD COLUMN IF NOT EXISTS markup_rate numeric;

ALTER TABLE public.work_menu_items
  ADD COLUMN IF NOT EXISTS markup_rate numeric;

COMMIT;
