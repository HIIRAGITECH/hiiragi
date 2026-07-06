-- ===========================================================================
-- PROD 手動適用用: work_menu_set_parts（作業セットに部品を含める・案2）
-- Supabase SQL Editor で「事前SELECT → 本体(BEGIN/COMMIT) → 事後SELECT」の順に実行。
-- ※ Claude Code は prod に書き込まない。適用は小野寺が手動で行う。
-- ※ 本体を適用してから、コードを main に push すること（DB先・コード後）。
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 【1】事前確認 SELECT（本体を流す前に実行）
--   - work_menu_set_parts が「まだ無い」こと（exists=false 期待）
--   - 親テーブル work_menu_sets / parts_inventory が「有る」こと（両方 true 期待）
-- ---------------------------------------------------------------------------
SELECT
  to_regclass('public.work_menu_set_parts') IS NOT NULL AS target_exists,   -- false 期待
  to_regclass('public.work_menu_sets')      IS NOT NULL AS parent_sets_ok,  -- true 期待
  to_regclass('public.parts_inventory')     IS NOT NULL AS parent_parts_ok; -- true 期待


-- ---------------------------------------------------------------------------
-- 【2】本体（トランザクション）。上の事前確認で target_exists=false を確認してから実行。
--   CREATE TABLE IF NOT EXISTS のため二重実行しても安全。
-- ---------------------------------------------------------------------------
BEGIN;

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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_menu_set_parts
  TO authenticated, service_role;

COMMIT;


-- ---------------------------------------------------------------------------
-- 【3】事後確認 SELECT（本体の後に実行）
--   期待値:
--     col_count      = 6
--     policy_count   = 4
--     rls_enabled    = true
--     dml_grants に authenticated と service_role の SELECT/INSERT/UPDATE/DELETE が並ぶ
-- ---------------------------------------------------------------------------
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_schema='public' AND table_name='work_menu_set_parts')      AS col_count,
  (SELECT count(*) FROM pg_policies
     WHERE schemaname='public' AND tablename='work_menu_set_parts')         AS policy_count,
  (SELECT relrowsecurity FROM pg_class
     WHERE oid = 'public.work_menu_set_parts'::regclass)                    AS rls_enabled,
  (SELECT string_agg(distinct grantee||':'||privilege_type, ', '
            ORDER BY grantee||':'||privilege_type)
     FROM information_schema.role_table_grants
     WHERE table_schema='public' AND table_name='work_menu_set_parts'
       AND grantee IN ('authenticated','service_role')
       AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE'))         AS dml_grants;
