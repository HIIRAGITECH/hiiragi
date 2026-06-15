-- Googleドライブ連携 段階4: orders に drive_folder_id 列を1本追加する。
--
-- 目的:
--   アプリが Drive 上に作った「受注子フォルダ」の Drive ID を保持し、二重作成を防ぐ（冪等判定）。
--   既存の手貼り photo_folder_url とは別管理。子フォルダ作成時は webViewLink を photo_folder_url
--   にも入れ、既存の「整備写真フォルダ」表示UIを流用する。
--
-- 範囲:
--   ADD COLUMN のみ。orders の既存データ・トリガ・採番（assign_order_id）には一切触れない
--   （採番トリガの発火順 s<v 地雷に近づかない）。RLS/GRANT も変更しない。
--   ※ orders への書き込みは authenticated クライアント（RLS owner ポリシー準拠）で行うため、
--     service_role への GRANT は不要（この project の「業務テーブルは authenticated のみDML」流儀を維持）。
--
-- 適用範囲: dev (qajrjtdwmxgmvzxecqvg) のみ。prod (jnhhrdsfsgjquiyxydzv) には適用しない。

BEGIN;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS drive_folder_id text;

-- 台帳登録 (db push で既適用扱いにする。statements 本体は再実行しない流儀)
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20260615020000', 'add_drive_folder_id_to_orders', '{}'::text[])
ON CONFLICT (version) DO NOTHING;

COMMIT;
