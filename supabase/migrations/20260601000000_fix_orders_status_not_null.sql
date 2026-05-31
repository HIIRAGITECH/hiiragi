-- orders.estimate_status / work_status を NOT NULL + DEFAULT 付きに揃える。
-- 本番DBでは schema.sql との乖離があり、estimate_status が nullable + DEFAULT 無しで運用されていた。
-- これにより createOrder（明示的に estimate_status を渡さない実装）で NULL が混入していた。
-- 冪等: 既に NOT NULL / DEFAULT 設定済みなら ALTER は no-op。

-- 既存の NULL をデフォルト値で埋める（dev は無いはず、prod は 1 件 → 既に修正済み）。
UPDATE orders SET estimate_status = '未作成' WHERE estimate_status IS NULL;
UPDATE orders SET work_status      = '受付'   WHERE work_status      IS NULL;

-- DEFAULT を保証。
ALTER TABLE orders ALTER COLUMN estimate_status SET DEFAULT '未作成';
ALTER TABLE orders ALTER COLUMN work_status      SET DEFAULT '受付';

-- NOT NULL を保証。
ALTER TABLE orders ALTER COLUMN estimate_status SET NOT NULL;
ALTER TABLE orders ALTER COLUMN work_status      SET NOT NULL;

-- CHECK 制約は dev / prod ともに既に存在 (orders_estimate_status_check / orders_work_status_check / orders_invoice_status_check)
-- なのでここでは追加しない。schema.sql との整合性のために存在は前提とする。
