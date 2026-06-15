-- Googleドライブ連携 段階1: トークン保管テーブル google_integrations を新設する。
--
-- 目的 (DECISIONS.md「2026-06-15 Googleドライブ連携 段階0」参照):
--   店舗 (user_id) ごとに1つ、Googleドライブ連携のトークンと親フォルダIDを保管する。
--   refresh_token 等は秘匿情報なので user_metadata ではなく RLS 付きテーブルに置き、
--   サーバー専用アクセスとする (RLS は owner = auth.uid()、書き込みはサーバー側経由)。
--
-- 今回の範囲:
--   テーブル新設のみ。OAuth フロー・Drive API・UI は次段階。加算的変更のみ。
--   既存テーブル・データには触らない。
--
-- カラム設計の判断:
--   - user_id に UNIQUE (1店舗1連携)。auth.users 削除で CASCADE。
--   - provider は将来の拡張用 (当面 'google' 固定)。
--   - refresh_token は当面平文。RLS + server-only で保護し、暗号化は後付け方針。
--   - access_token / token_expiry は短命。保存有無は実装時判断 (無くても可)。
--   - root_folder_id は連携時に作る親フォルダ「HIIRAGI受注写真」の Drive ID。
--   - deleted_at でソフトデリート。
--
-- RLS / トリガ:
--   既存テーブルと同じ流儀 (user_id = auth.uid() の単純ポリシー4本) に揃える。
--   updated_at は既存の public.touch_updated_at() トリガを流用。
--
-- 適用範囲: dev (qajrjtdwmxgmvzxecqvg) のみ。prod (jnhhrdsfsgjquiyxydzv) には適用しない。
--   本番 DB へ展開する場合は Supabase ダッシュボード or CLI から手動適用すること。

BEGIN;

CREATE TABLE IF NOT EXISTS public.google_integrations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  provider        text NOT NULL DEFAULT 'google',
  google_email    text,
  refresh_token   text,
  access_token    text,
  token_expiry    timestamptz,
  root_folder_id  text,
  deleted_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.google_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY google_integrations_owner_select ON public.google_integrations
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY google_integrations_owner_insert ON public.google_integrations
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY google_integrations_owner_update ON public.google_integrations
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY google_integrations_owner_delete ON public.google_integrations
  FOR DELETE USING (user_id = auth.uid());

CREATE TRIGGER google_integrations_touch_updated_at
  BEFORE UPDATE ON public.google_integrations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 台帳登録 (db push で既適用扱いにする。statements 本体は再実行しない流儀)
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20260615000000', 'create_google_integrations', '{}'::text[])
ON CONFLICT (version) DO NOTHING;

COMMIT;
