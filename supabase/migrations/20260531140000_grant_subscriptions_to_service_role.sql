-- このプロジェクトでは public スキーマの全テーブルで
-- service_role に CRUD GRANT が付与されていない（postgres ロールにだけ付与されている）。
-- 既存テーブルは admin client から書き込まないので問題化していなかったが、
-- subscriptions は Stripe webhook が service role で UPSERT するため必須。
-- RLS は本人 SELECT のみのままで、service_role は BYPASSRLS で書き込める。

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.subscriptions
  TO service_role;
