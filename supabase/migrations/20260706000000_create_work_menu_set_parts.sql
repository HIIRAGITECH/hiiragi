-- 作業セットに「部品」も含められるようにする（案2：別テーブル新設）。
-- 既存のメニュー中間テーブル work_menu_set_items は一切触らず、メニュー経路を壊さない。
-- 部品は part_id ＋ quantity ＋ position のみ保持し、価格・variant は持たない。
-- 価格は受注展開時にその受注の車種で解決する（rowFromPart / effectiveByPart を流用）。
--
-- 本番 DB へは Supabase SQL Editor から手動適用すること（DB先・コード後）。

-- ============================================
-- work_menu_set_parts: セットの中身（作業セット ↔ 部品マスター）
-- work_menu_set_items（メニュー用）に倣った構造。
--   - set_id  : ON DELETE CASCADE（セット削除で中身も消える）
--   - part_id : ON DELETE RESTRICT（menu_item_id に倣う。部品はソフト削除のため実害なし）
--   - quantity: 展開時に明細の数量へ反映（既定 1）
--   - position: セット内の並び順
-- ============================================
CREATE TABLE IF NOT EXISTS work_menu_set_parts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id      uuid NOT NULL REFERENCES work_menu_sets(id)   ON DELETE CASCADE,
  part_id     uuid NOT NULL REFERENCES parts_inventory(id)  ON DELETE RESTRICT,
  quantity    numeric NOT NULL DEFAULT 1,
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS work_menu_set_parts_set_pos_idx
  ON work_menu_set_parts(set_id, position);

-- RLS: work_menu_set_items と同じく、親 work_menu_sets の所有者だけが触れる。
ALTER TABLE work_menu_set_parts ENABLE ROW LEVEL SECURITY;
CREATE POLICY work_menu_set_parts_owner_select ON work_menu_set_parts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM work_menu_sets s
            WHERE s.id = set_id AND s.user_id = auth.uid())
  );
CREATE POLICY work_menu_set_parts_owner_insert ON work_menu_set_parts
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM work_menu_sets s
            WHERE s.id = set_id AND s.user_id = auth.uid())
  );
CREATE POLICY work_menu_set_parts_owner_update ON work_menu_set_parts
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM work_menu_sets s
            WHERE s.id = set_id AND s.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM work_menu_sets s
            WHERE s.id = set_id AND s.user_id = auth.uid())
  );
CREATE POLICY work_menu_set_parts_owner_delete ON work_menu_set_parts
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM work_menu_sets s
            WHERE s.id = set_id AND s.user_id = auth.uid())
  );

-- DML GRANT（42501 回避）。既存の作業セット関連テーブルは authenticated への DML を
-- Supabase の default privileges 経由で得ているが、prod の default 設定に依存せず確実に
-- 付与するため明示 GRANT する。service_role は BYPASSRLS 用に併せて付与（既存 subscriptions に倣う）。
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_menu_set_parts TO authenticated, service_role;
