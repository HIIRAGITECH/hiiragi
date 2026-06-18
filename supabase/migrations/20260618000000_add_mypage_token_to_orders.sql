-- お客様マイページ機能 段階1: orders にマイページURL用の2列を追加する。
--
-- 目的:
--   お客様向けマイページURLのトークンと有効期限を orders に保持する。
--     mypage_token      : マイページURLのトークン。発行時にセット、未発行は NULL。
--     mypage_expires_at : マイページURLの有効期限（発行日+45日）。未発行は NULL。
--   発行済みトークンの一意性を保証するため、mypage_token に部分ユニークインデックスを張る
--   （IS NOT NULL のみ対象。未発行=NULL は複数行あってよい）。
--
-- 経緯:
--   5/31 に同名機能を試作したが token_expires_at 命名でロールバック済み。今回は
--   mypage_token / mypage_expires_at で命名を確定（前回とは別名・別実装）。残骸は無い。
--
-- 範囲:
--   ADD COLUMN と部分ユニークインデックスのみ。orders の既存データ・採番（assign_order_id）・
--   updated_at トリガには一切触れない（採番トリガの発火順 s<v 地雷に近づかない）。
--   RLS/GRANT も変更しない。マイページ表示は service role 経由で読むが、それは表示実装フェーズで対応する
--   （この project の「業務テーブルは authenticated のみDML」流儀を維持）。
--   既存データへの影響なし: 全行 mypage_token=NULL / mypage_expires_at=NULL になるだけ。
--
-- 適用範囲: dev (qajrjtdwmxgmvzxecqvg) のみ。prod (jnhhrdsfsgjquiyxydzv) には適用しない。

BEGIN;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS mypage_token      text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS mypage_expires_at timestamptz;

-- 発行済みトークンの一意性を保証（未発行=NULL は対象外）。
CREATE UNIQUE INDEX IF NOT EXISTS orders_mypage_token_key
  ON public.orders (mypage_token)
  WHERE mypage_token IS NOT NULL;

-- 台帳登録 (db push で既適用扱いにする。statements 本体は再実行しない流儀)
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20260618000000', 'add_mypage_token_to_orders', '{}'::text[])
ON CONFLICT (version) DO NOTHING;

COMMIT;
