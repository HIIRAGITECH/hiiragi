-- 作業メニュー（マスター）と作業セット（ひとまとめにして一括追加できるテンプレート）を導入する。
-- いずれも user_id ベースの RLS で他人のデータを見えなくする。
-- 既存テーブル（orders.items 等）には触らない。
--
-- 本番 DB へは Supabase ダッシュボード or CLI から手動適用すること。

-- ============================================
-- 1) work_menu_items: 作業メニュー（マスター）
-- ============================================
CREATE TABLE IF NOT EXISTS work_menu_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  work_name           text NOT NULL,
  part_name           text,
  category            text NOT NULL CHECK (category IN ('normal','shaken','shaken_tax_free')),
  default_quantity    numeric NOT NULL DEFAULT 1,
  default_unit_price  numeric NOT NULL DEFAULT 0,
  default_labor_cost  numeric NOT NULL DEFAULT 0,
  default_parts_cost  numeric NOT NULL DEFAULT 0,
  tax_free            boolean NOT NULL DEFAULT false,
  display_order       integer NOT NULL DEFAULT 0,
  memo                text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS work_menu_items_user_order_idx
  ON work_menu_items(user_id, display_order);
CREATE INDEX IF NOT EXISTS work_menu_items_user_category_idx
  ON work_menu_items(user_id, category);

ALTER TABLE work_menu_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY work_menu_items_owner_select ON work_menu_items
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY work_menu_items_owner_insert ON work_menu_items
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY work_menu_items_owner_update ON work_menu_items
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY work_menu_items_owner_delete ON work_menu_items
  FOR DELETE USING (user_id = auth.uid());

-- ============================================
-- 2) work_menu_sets: 作業セット
-- ============================================
CREATE TABLE IF NOT EXISTS work_menu_sets (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name           text NOT NULL,
  memo           text,
  display_order  integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS work_menu_sets_user_order_idx
  ON work_menu_sets(user_id, display_order);

ALTER TABLE work_menu_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY work_menu_sets_owner_select ON work_menu_sets
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY work_menu_sets_owner_insert ON work_menu_sets
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY work_menu_sets_owner_update ON work_menu_sets
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY work_menu_sets_owner_delete ON work_menu_sets
  FOR DELETE USING (user_id = auth.uid());

-- ============================================
-- 3) work_menu_set_items: セットの中身（作業セット ↔ 作業メニュー）
-- ============================================
CREATE TABLE IF NOT EXISTS work_menu_set_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id        uuid NOT NULL REFERENCES work_menu_sets(id)  ON DELETE CASCADE,
  menu_item_id  uuid NOT NULL REFERENCES work_menu_items(id) ON DELETE RESTRICT,
  position      integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS work_menu_set_items_set_pos_idx
  ON work_menu_set_items(set_id, position);

ALTER TABLE work_menu_set_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY work_menu_set_items_owner_select ON work_menu_set_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM work_menu_sets s
            WHERE s.id = set_id AND s.user_id = auth.uid())
  );
CREATE POLICY work_menu_set_items_owner_insert ON work_menu_set_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM work_menu_sets s
            WHERE s.id = set_id AND s.user_id = auth.uid())
  );
CREATE POLICY work_menu_set_items_owner_update ON work_menu_set_items
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM work_menu_sets s
            WHERE s.id = set_id AND s.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM work_menu_sets s
            WHERE s.id = set_id AND s.user_id = auth.uid())
  );
CREATE POLICY work_menu_set_items_owner_delete ON work_menu_set_items
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM work_menu_sets s
            WHERE s.id = set_id AND s.user_id = auth.uid())
  );

-- ============================================
-- 4) updated_at 自動更新トリガー（新規テーブルのみ）
-- 既存テーブル (customers / vehicles / orders) と同じ touch_updated_at() を再利用する。
-- ============================================
CREATE TRIGGER work_menu_items_touch_updated_at
  BEFORE UPDATE ON work_menu_items
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER work_menu_sets_touch_updated_at
  BEFORE UPDATE ON work_menu_sets
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
