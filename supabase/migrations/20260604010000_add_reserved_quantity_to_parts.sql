-- 在庫確保(引当)モデルの基盤として parts_inventory に reserved_quantity を追加する。
--
-- 用途（Step 1 時点）:
--   利用可能数 = stock_quantity - reserved_quantity を「部品在庫から追加」ピッカーで
--   表示するための基盤カラム。今回は値を増減させる処理は作らない（常に 0）。
--   在庫の自動確保(reserve)・消費(consume)は Step 2 以降で別途実装する。
--
-- 加算的変更のみ（ADD COLUMN IF NOT EXISTS で冪等）。本番 DB へは Supabase ダッシュボード
-- or CLI から手動適用すること（dev 確認 → prod の順）。

BEGIN;

ALTER TABLE public.parts_inventory
  ADD COLUMN IF NOT EXISTS reserved_quantity numeric NOT NULL DEFAULT 0;

COMMIT;
