-- レガシーのid採番トリガと関数を削除する。
--
-- 背景:
--   本番DBに schema.sql 未定義の旧採番系が残存していた。
--     TRIGGER set_customer_id ON customers → generate_customer_id()
--     TRIGGER set_vehicle_id  ON vehicles  → generate_vehicle_id()
--   旧関数はグローバルシーケンス nextval('customer_id_seq') / nextval('vehicle_id_seq')
--   で採番する方式だが、これらのシーケンスは既に削除済み。
--
--   正規の per-user カウンタ方式（assign_customer_id / assign_vehicle_id +
--   customer_seq / vehicle_seq）へ移行した際に、旧トリガ・関数だけが消し残された。
--
-- 問題:
--   BEFORE INSERT ROW トリガはトリガ名のアルファベット順に発火する。
--     customers: customers_assign_id (c) → set_customer_id (s)
--                先に正規トリガがidを埋めるため set_customer_id の WHEN(id IS NULL) は偽 → 無害
--     vehicles : set_vehicle_id (s) → vehicles_assign_id (v)
--                先にレガシーが発火し、存在しない vehicle_id_seq を参照して INSERT が失敗していた
--   → 本番で車両登録が常に失敗していた（vehicles 0 件）。
--
-- 対応:
--   レガシートリガ・関数を削除する。正規トリガ（per-user採番）のみ残す。
--   customers は現状無害だが時限爆弾のため同時に削除する。
--
-- 冪等: DROP ... IF EXISTS のため、既にクリーンな環境（dev）では NOOP。

BEGIN;

DROP TRIGGER IF EXISTS set_customer_id ON public.customers;
DROP TRIGGER IF EXISTS set_vehicle_id ON public.vehicles;
DROP FUNCTION IF EXISTS public.generate_customer_id();
DROP FUNCTION IF EXISTS public.generate_vehicle_id();

COMMIT;
