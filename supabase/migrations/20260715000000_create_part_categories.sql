-- 部品カテゴリ（テナント別・自己参照ツリー・最大3階層）を新設する（部品カテゴリ 段階1）。
--
-- 位置づけ:
--   部品在庫(parts_inventory)を「テナントが自由に作る大／中／小のカテゴリ」で分類するための
--   マスターテーブル。段階1はカテゴリの器と管理画面のみ。部品への紐付け(parts_inventory.category_id)
--   は段階2、一覧の絞り込みは段階3で行う。このテーブルは今回どこからも参照されない（器だけ先に作る）。
--
-- 作業カテゴリ(work_item_categories／受注明細用)とは完全に別物・物理的に別テーブル。混在させない。
--   結果的に「自己参照ツリー」という構造は似るが、それは要件に対する正しい選択が一致しただけで、
--   部品用として独立して設計・運用する。work_item_categories には一切触れない。
--
-- データ構造の判断:
--   - 自己参照ツリー: parent_id で親を指す。トップ(大分類)は parent_id IS NULL。
--   - level は 1=大 / 2=中 / 3=小。CHECK (level BETWEEN 1 AND 3) で 4 階層目を DB で拒否する。
--   - level と parent_id の整合も CHECK で縛る（level=1 は親なし、level>1 は親必須）。
--     これにより「大の直下に小」や「親なしの中」といった不整合をDBが弾く。
--   - テナントは 1〜3 階層を自由に使える（中・小は任意）。分類の軸も自由。デフォルトは入れない(seed なし)。
--   - sort_order: 同じ親の中での表示順。並べ替えは (user_id, parent_id) スコープで行う。
--
-- 削除の設計（判断・段階1では合理的）:
--   - 削除はハード削除。親を消すと ON DELETE CASCADE で配下の中・小も消える（枝ごと削除）。
--   - 段階1では部品からの参照がまだ無いため、参照整合の心配なくカスケードで自己完結できる。
--   - 段階2で parts_inventory.category_id を足す際は、部品側を ON DELETE SET NULL 等で守る（別段階）。
--   - work_item_categories はソフト削除(deleted_at)だが、本テーブルは deleted_at を持たない。
--     カラム列挙にも無く、木構造のソフト削除（親だけ非表示で子が浮く）を避けるための意図的な選択。
--
-- RLS / GRANT:
--   - RLS は本人のみ 4 ポリシー（user_id = auth.uid()）。work_item_categories / parts_inventory に倣う。
--   - DML GRANT を authenticated / service_role に明示付与（42501 回避）。prod の default privileges に
--     依存せず確実に付けるため、直近の work_menu_set_parts と同じ流儀で明示 GRANT する。
--   - updated_at は既存の public.touch_updated_at() トリガを流用。
--
-- 本番 DB へは Supabase SQL Editor から手動適用すること（DB先・コード後）。

BEGIN;

CREATE TABLE IF NOT EXISTS public.part_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id   uuid REFERENCES public.part_categories(id) ON DELETE CASCADE,
  name        text NOT NULL,
  level       smallint NOT NULL DEFAULT 1,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  -- 4 階層目を作れない（大=1 / 中=2 / 小=3）。
  CONSTRAINT part_categories_level_range CHECK (level BETWEEN 1 AND 3),
  -- level と parent_id の整合。大は親なし、中・小は親必須。
  CONSTRAINT part_categories_level_parent CHECK (
    (level = 1 AND parent_id IS NULL) OR
    (level > 1 AND parent_id IS NOT NULL)
  )
);

-- 同じ親の中を並び順で引く（ツリー描画・並べ替えで多用）。
CREATE INDEX IF NOT EXISTS part_categories_user_parent_order_idx
  ON public.part_categories(user_id, parent_id, sort_order);

ALTER TABLE public.part_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY part_categories_owner_select ON public.part_categories
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY part_categories_owner_insert ON public.part_categories
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY part_categories_owner_update ON public.part_categories
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY part_categories_owner_delete ON public.part_categories
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER part_categories_touch_updated_at
  BEFORE UPDATE ON public.part_categories
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- DML GRANT（42501 回避）。authenticated は RLS 準拠でCRUD、service_role は BYPASSRLS 用に併せて付与。
GRANT SELECT, INSERT, UPDATE, DELETE ON public.part_categories TO authenticated, service_role;

COMMIT;
