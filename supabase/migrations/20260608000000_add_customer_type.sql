-- 業販対応 第一歩: customers に法人/個人の区分 (customer_type) を持たせる。
--
-- 背景:
--   prod の customers には customer_type 列が過去に作られたまま放置されている
--   （text NULL 可・全件 NULL・アプリ未認識）。今回はこれを完成させる形で再利用し、
--   dev には新規追加する。dev/prod の他の差分 (company_name/furigana/line_id 残骸、
--   name の NULL 制約等) には一切触らない。customer_type だけに集中する。
--
-- 値モデル:
--   既存の区分系カラム (work_menu_items.tax_category 等) と同流儀で
--   text + CHECK ('personal','business')。デフォルト 'personal'。
--   既存 NULL は 'personal' にバックフィルしてから NOT NULL を付ける。
--
-- 冪等性:
--   ADD COLUMN IF NOT EXISTS / WHERE IS NULL バックフィル / 制約は事前 DROP IF EXISTS で再入可。
--
-- 本番 DB へは Supabase ダッシュボード or CLI から手動適用すること。

BEGIN;

-- 1) 列追加 (dev=新規 / prod=既存のため no-op)
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS customer_type text;

-- 2) 既存 NULL を 'personal' にバックフィル
UPDATE public.customers
   SET customer_type = 'personal'
 WHERE customer_type IS NULL;

-- 3) DEFAULT を設定 (今後の INSERT で省略可能に)
ALTER TABLE public.customers
  ALTER COLUMN customer_type SET DEFAULT 'personal';

-- 4) NOT NULL を設定 (バックフィル済みなので安全)
ALTER TABLE public.customers
  ALTER COLUMN customer_type SET NOT NULL;

-- 5) CHECK 制約を追加 ('personal' か 'business' のみ許容)
ALTER TABLE public.customers
  DROP CONSTRAINT IF EXISTS customers_customer_type_check;
ALTER TABLE public.customers
  ADD CONSTRAINT customers_customer_type_check
  CHECK (customer_type IN ('personal', 'business'));

COMMIT;
