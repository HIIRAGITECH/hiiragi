-- お客様マイページ（段階3）: トークンで1件の受注＋関連顧客・車両を読むための
-- SECURITY DEFINER 関数。
--
-- 背景:
--   このプロジェクトは service_role に業務テーブル（orders/customers/vehicles）の
--   GRANT を一切与えていない（20260531140000 のコメント参照。subscriptions だけ例外）。
--   マイページ表示はログイン不要のお客様向けで service role 読み取りが必要だが、
--   テーブル GRANT を広げると service role キー漏洩時に全テナントの業務データが
--   直接読めてしまう。そこで「トークン一致の1件＋お客様に見せてよい列だけ」を返す
--   関数を1つだけ公開し、テーブル GRANT は付与しない（最小権限）。
--
-- 方針:
--   - SECURITY DEFINER（オーナ=postgres 権限で実行、RLS バイパス）。
--   - search_path='' に固定し、全テーブルをスキーマ修飾（DEFINER 関数のベストプラクティス）。
--   - EXECUTE は service_role にのみ付与。anon/authenticated/PUBLIC からは剥がす
--     （/rest/v1/rpc 直叩き防止。create_default_subscription と同じ作法）。
--   - 期限切れ判定は関数では行わず mypage_expires_at を返す。loader が現在時刻と比較して
--     expired/ok を出し分ける（既存の判別共用体を維持）。
--   - items(jsonb) には原価系フィールドが含まれるがここでは丸ごと返さざるを得ない。
--     アプリ側サニタイズ層（toMypageItem）が原価を捨てる二重防御で守る。
--
-- 返す列（お客様に見せてよいものだけ）:
--   order: id, work/estimate/invoice_status, reception_date, items, discount/deposit,
--          photo_folder_url, payment_due_date, invoice_notes, invoiced_at, paid_at,
--          mypage_expires_at, user_id（店舗情報取得用）, customer_id
--   customer: name のみ（住所/電話/email/フリガナは返さない）
--   vehicle: maker, model, model_year, color のみ（vin/plate_number は返さない）
--
-- 適用範囲: dev (qajrjtdwmxgmvzxecqvg) のみ。prod (jnhhrdsfsgjquiyxydzv) には適用しない。

BEGIN;

CREATE OR REPLACE FUNCTION public.mypage_get_by_token(p_token text)
RETURNS TABLE (
  order_id            text,
  work_status         text,
  estimate_status     text,
  invoice_status      text,
  reception_date      date,
  items               jsonb,
  discount_amount     integer,
  deposit_amount      integer,
  photo_folder_url    text,
  payment_due_date    date,
  invoice_notes       text,
  invoiced_at         timestamptz,
  paid_at             timestamptz,
  mypage_expires_at   timestamptz,
  order_user_id       uuid,
  customer_id         text,
  customer_name       text,
  vehicle_maker       text,
  vehicle_model       text,
  vehicle_model_year  integer,
  vehicle_color       text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT
    o.id,
    o.work_status,
    o.estimate_status,
    o.invoice_status,
    o.reception_date,
    o.items,
    o.discount_amount,
    o.deposit_amount,
    o.photo_folder_url,
    o.payment_due_date,
    o.invoice_notes,
    o.invoiced_at,
    o.paid_at,
    o.mypage_expires_at,
    o.user_id,
    o.customer_id,
    c.name,
    v.maker,
    v.model,
    v.model_year,
    v.color
  FROM public.orders o
  LEFT JOIN public.customers c
    ON c.user_id = o.user_id AND c.id = o.customer_id
  LEFT JOIN public.vehicles v
    ON v.user_id = o.user_id AND v.id = o.vehicle_id
  WHERE o.mypage_token = p_token
  LIMIT 1;
$$;

-- /rest/v1/rpc から匿名・一般ユーザーが直接叩けないよう EXECUTE を剥がし、
-- service_role（admin client）にだけ付与する。
REVOKE EXECUTE ON FUNCTION public.mypage_get_by_token(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mypage_get_by_token(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mypage_get_by_token(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mypage_get_by_token(text) TO service_role;

-- 台帳登録（db push で既適用扱いにする。statements 本体は再実行しない流儀）
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20260618010000', 'create_mypage_get_by_token', '{}'::text[])
ON CONFLICT (version) DO NOTHING;

COMMIT;
