-- Googleドライブ連携 段階2 修正: google_integrations への service_role GRANT を追加する。
--
-- 背景:
--   OAuth コールバック (app/api/google/oauth/callback) はトークンを admin client
--   (service_role) で upsert する。しかし本 project は全テーブルで DML を
--   authenticated にのみ付与し、service_role には REFERENCES/TRIGGER/TRUNCATE しか
--   付けていない流儀のため、service_role からの INSERT が
--   permission denied for table google_integrations (42501) で弾かれていた。
--   = RLS バイパス以前の「テーブルアクセス権」の問題。
--
-- 対処:
--   google_integrations は他テーブルと違い admin client から書くため、
--   このテーブルに限り service_role へ DML を付与する。
--   authenticated は既に full DML を持つため変更不要。
--   RLS は維持し、owner ポリシー4本もそのまま残す
--   (GRANT は RLS の手前のアクセス権で、両者は別レイヤ)。
--
-- 適用範囲: dev (qajrjtdwmxgmvzxecqvg) のみ。prod (jnhhrdsfsgjquiyxydzv) には適用しない。
--   本番展開時は Supabase ダッシュボード or CLI から手動適用すること。

BEGIN;

GRANT ALL ON TABLE public.google_integrations TO service_role;

-- 台帳登録 (db push で既適用扱いにする。statements 本体は再実行しない流儀)
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20260615010000', 'grant_google_integrations', '{}'::text[])
ON CONFLICT (version) DO NOTHING;

COMMIT;
