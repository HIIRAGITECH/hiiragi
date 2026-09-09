-- 部品在庫の商品画像 parts_inventory_images を新設する。
--
-- 設計判断 (DECISIONS.md 2026-09-09 参照):
--   - 画像は **親 parts_inventory に紐づける**。二階(parts_inventory_variants)には持たせない。
--     理由: 画像は「物理部品そのものの写真」であり、車種別の呼称(売り方)ごとには変わらない。
--     DECISIONS.md §3「部品は寸法で1行(在庫は割らない)。売り方だけを二階にぶら下げる」と一貫する。
--   - 1部品あたり最大5枚・0枚も許容(画像は任意)。並び順を保持し **display_order=0 を代表画像(サムネイル)** とする。
--   - 実体は Supabase Storage の非公開バケット `part-images` に置き、この表は **storage_path のみ**を持つ。
--     URL は保存しない(署名付きURLは都度発行・失効する)。将来ECから同じ画像を参照するときも、
--     「パスを持ち、配信経路は差し替えられる」形にしておくため。バケット/ポリシーは
--     20260909010000_create_part_images_bucket.sql で作る。
--
-- 今回の範囲:
--   新規テーブル1本のみ。既存テーブルの列は追加も含め一切変更しない。
--   在庫RPC(reserve/release/consume/unconsume/deduct 系)には触れないし、
--   本トリガも parts_inventory の行ロックを取らない(下記 advisory lock 参照)ので競合しない。
--
-- 本番 DB へは Supabase ダッシュボード(SQL Editor) から手動適用すること。

BEGIN;

CREATE TABLE IF NOT EXISTS public.parts_inventory_images (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  part_id        uuid NOT NULL REFERENCES public.parts_inventory(id) ON DELETE CASCADE,
  -- Storage 上のオブジェクトパス。形式は `<user_id>/<part_id>/<uuid>.<ext>`。
  -- 先頭フォルダを user_id にするのは shop-assets バケットと同じ流儀
  -- (storage.foldername(name))[1] = auth.uid() でポリシーを書けるようにするため。
  storage_path   text NOT NULL,
  display_order  integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),

  -- 5枚制限の宣言的な一枚目の壁。アプリは常に 0..n-1 を書くので、
  -- 「0..4 しか入らない」= 同一 part で取り得る display_order は高々5種類、という保証になる。
  -- (行数そのものの上限は下のトリガで担保する。両方でニ重に閉じる。)
  CONSTRAINT parts_inventory_images_display_order_range
    CHECK (display_order >= 0 AND display_order < 5)
);

-- 親→画像 引き(一覧のサムネイル・編集画面)。代表画像は (part_id, display_order=0)。
CREATE INDEX IF NOT EXISTS parts_inventory_images_part_order_idx
  ON public.parts_inventory_images(part_id, display_order);

-- テナント単位の一括取得(一覧のサムネイル)用。
CREATE INDEX IF NOT EXISTS parts_inventory_images_user_idx
  ON public.parts_inventory_images(user_id);

-- 1オブジェクト = 1行。二重登録を防ぐ(DB行を消したら Storage 実体も消す運用のため、
-- 同じパスを2行が参照していると片方の削除でもう片方が壊れる)。
CREATE UNIQUE INDEX IF NOT EXISTS parts_inventory_images_storage_path_key
  ON public.parts_inventory_images(storage_path);

-- ============================================
-- 5枚制限 + 所有者一致 のガード(DB側の担保)
-- ============================================
-- なぜトリガか:
--   「1部品5枚まで」は行数の制約なので CHECK では書けない。COUNT(*) で見るしかない。
--   単純な COUNT だと同時 INSERT がすり抜けるため、**part_id をキーにした advisory lock** で
--   同一部品への INSERT を直列化する。
--   parts_inventory の行ロック(SELECT ... FOR UPDATE)は **あえて使わない**。
--   在庫RPC(reserve/release/consume/…)が parts_inventory を UPDATE するため、
--   そこに画像側からロックを持ち込まない = 在庫処理と原理的に競合しない、という線引き。
--
-- ついでに「画像の user_id は必ず親部品の所有者と一致」も見る。
--   RLS の user_id = auth.uid() だけでは「自分の user_id で他テナントの part_id を指す行」を
--   防げない(FK はテナントを見ない)ため、DB 側でも閉じておく。
CREATE OR REPLACE FUNCTION public.parts_inventory_images_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
DECLARE
  parent_user_id uuid;
  current_count  integer;
BEGIN
  -- 同一部品への同時 INSERT を直列化する(テーブルには触らないトランザクションスコープのロック)。
  PERFORM pg_advisory_xact_lock(
    hashtext('parts_inventory_images'),
    hashtext(NEW.part_id::text)
  );

  -- 親の所有者。RLS 下では他テナントの部品は見えないので、その場合も NULL になり弾かれる。
  SELECT p.user_id INTO parent_user_id
  FROM public.parts_inventory p
  WHERE p.id = NEW.part_id;

  IF parent_user_id IS NULL THEN
    RAISE EXCEPTION '対象の部品が見つかりません (part_id=%)', NEW.part_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF parent_user_id <> NEW.user_id THEN
    RAISE EXCEPTION '画像の user_id が部品の所有者と一致しません (part_id=%)', NEW.part_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- 自分自身は数えない(UPDATE で part_id を移す場合に備える)。
  SELECT count(*) INTO current_count
  FROM public.parts_inventory_images i
  WHERE i.part_id = NEW.part_id
    AND i.id IS DISTINCT FROM NEW.id;

  IF current_count >= 5 THEN
    RAISE EXCEPTION '1部品あたりの画像は5枚までです (part_id=%)', NEW.part_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS parts_inventory_images_guard_biu ON public.parts_inventory_images;
CREATE TRIGGER parts_inventory_images_guard_biu
  BEFORE INSERT OR UPDATE OF part_id, user_id ON public.parts_inventory_images
  FOR EACH ROW EXECUTE FUNCTION public.parts_inventory_images_guard();

-- ============================================
-- RLS: 既存 parts_inventory / parts_inventory_variants と同じ流儀(単純ポリシー4本)
-- ============================================
ALTER TABLE public.parts_inventory_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parts_inventory_images_owner_select ON public.parts_inventory_images;
CREATE POLICY parts_inventory_images_owner_select ON public.parts_inventory_images
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS parts_inventory_images_owner_insert ON public.parts_inventory_images;
CREATE POLICY parts_inventory_images_owner_insert ON public.parts_inventory_images
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS parts_inventory_images_owner_update ON public.parts_inventory_images;
CREATE POLICY parts_inventory_images_owner_update ON public.parts_inventory_images
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS parts_inventory_images_owner_delete ON public.parts_inventory_images;
CREATE POLICY parts_inventory_images_owner_delete ON public.parts_inventory_images
  FOR DELETE USING (user_id = auth.uid());

COMMIT;
