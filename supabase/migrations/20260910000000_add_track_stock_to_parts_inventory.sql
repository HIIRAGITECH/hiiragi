-- 部品在庫に「在庫を追跡するか」の真偽区分（track_stock）を追加する。
--
-- 背景:
--   現場の大半の部品は「買う→すぐOHで使う」流れで棚に置く期間がほぼなく、入庫登録もしないため
--   在庫数はマイナスのまま＝常時「欠品／要発注」表示になる（実害なし・正常運用）。一方で今後 EC で
--   売る部品（FG Gubellini の補修部品）は売るために在庫を持つため数量を正確に保ちたい。この2種類を
--   区別するためのフラグ。true=在庫を追跡する（従来どおり発注点判定・欠品表示）／false=追跡しない
--   （在庫数は表示するが発注点判定・欠品/要発注バッジの対象外）。
--
-- 加算的・後方互換:
--   - 既定値は false（＝追跡しない）。NOT NULL DEFAULT false で ADD COLUMN するため、既存の全行
--     （現状 23 行）も自動的に track_stock=false で初期化される（＝全部品が従来の欠品表示から外れる）。
--   - 定数デフォルトの ADD COLUMN は Postgres 11+ ではメタデータのみの変更でテーブル書き換えを伴わず安全。
--   - 表示上の扱い（バッジ・フィルタ・発注アラート）を分岐させるだけの列。在庫数(stock_quantity)・予約数
--     (reserved_quantity)・発注点(reorder_point) などの既存カラムや、在庫RPC（reserve/release/consume/
--     unconsume/deduct 系）・在庫数の計算ロジックには一切関与しない（触らない）。
--
-- GRANT:
--   parts_inventory は既に authenticated / service_role へ DML 付与済み。カラム追加はテーブル権限を
--   継承するため追加 GRANT 不要（新規テーブルではないため 42501 の懸念なし）。
--
-- 本番 DB へは Supabase SQL Editor から手動適用すること（DB先・コード後）。prod MCP は読み取り専用。

BEGIN;

ALTER TABLE public.parts_inventory
  ADD COLUMN IF NOT EXISTS track_stock boolean NOT NULL DEFAULT false;

COMMIT;
