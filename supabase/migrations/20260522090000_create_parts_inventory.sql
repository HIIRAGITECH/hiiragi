-- 部品マスター（在庫表）と在庫移動履歴を新設（Step 2）。
-- 新規テーブルのみで既存テーブルには触らないため、既存機能への影響なし。
-- 本番 DB へは Supabase ダッシュボード or CLI から手動適用すること。

-- ============================================
-- 1) parts_inventory: 部品マスター（在庫表）
-- ============================================
CREATE TABLE IF NOT EXISTS parts_inventory (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            text NOT NULL,
  cost_price      numeric NOT NULL DEFAULT 0,
  sale_price      numeric,                    -- 売価（間接材料は null 可）
  show_in_detail  boolean NOT NULL DEFAULT true,  -- 明細に出す/出さない
  stock_quantity  numeric NOT NULL DEFAULT 0,
  reorder_point   numeric NOT NULL DEFAULT 0,
  supplier        text,
  unit            text,
  memo            text,
  display_order   integer NOT NULL DEFAULT 0,
  deleted_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS parts_inventory_user_order_idx
  ON parts_inventory(user_id, display_order);
CREATE INDEX IF NOT EXISTS parts_inventory_user_active_idx
  ON parts_inventory(user_id) WHERE deleted_at IS NULL;

ALTER TABLE parts_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY parts_inventory_owner_select ON parts_inventory
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY parts_inventory_owner_insert ON parts_inventory
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY parts_inventory_owner_update ON parts_inventory
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY parts_inventory_owner_delete ON parts_inventory
  FOR DELETE USING (user_id = auth.uid());

CREATE TRIGGER parts_inventory_touch_updated_at
  BEFORE UPDATE ON parts_inventory
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ============================================
-- 2) stock_movements: 在庫移動履歴
-- ============================================
CREATE TABLE IF NOT EXISTS stock_movements (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  part_id           uuid NOT NULL REFERENCES parts_inventory(id) ON DELETE CASCADE,
  movement_type     text NOT NULL CHECK (movement_type IN ('in','out','adjust')),
  quantity          numeric NOT NULL,          -- 増減数（+/−）
  related_order_id  uuid,                       -- 出庫時の受注参照（今回は未使用）
  unit_cost         numeric,                    -- 入庫時の仕入単価記録
  memo              text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stock_movements_user_part_created_idx
  ON stock_movements(user_id, part_id, created_at DESC);

ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY stock_movements_owner_select ON stock_movements
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY stock_movements_owner_insert ON stock_movements
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY stock_movements_owner_update ON stock_movements
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY stock_movements_owner_delete ON stock_movements
  FOR DELETE USING (user_id = auth.uid());
