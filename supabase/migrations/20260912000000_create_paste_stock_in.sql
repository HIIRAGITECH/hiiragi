-- 部品在庫の「貼り付け入庫」機能。仕入先の納品書から起こしたタブ区切り表を貼り付けて、
-- 既存部品の入庫（在庫加算・任意で原価更新）と新規部品の登録＋初期入庫を一括で確定する。
--
-- 設計方針（DECISIONS.md 2026-09-12 参照 / 既存制約の遵守）:
--   - 更新するのは **原価(cost_price) と 在庫数(stock_quantity) のみ**。定価は parts_inventory には無く、
--     二階(parts_inventory_variants.list_price) が持つ売値であり **一切書き込まない**（メーカー希望小売価格とは無関係）。
--   - 入庫は **在庫数の加算のみ**。既存の在庫RPC（reserve/release/consume/unconsume/deduct 系）・
--     reserved_quantity・在庫数の計算ロジックには一切触れない。ここで作るのは独立した加算＋履歴のみ。
--   - 既存カラムの変更・削除はしない（追加のみ）。stock_movements への batch_id 追加は nullable の加算列で、
--     既存の入庫/棚卸/出庫の挿入は batch_id を指定しない＝従来どおり null になり無影響。
--   - 新規登録は既存 createPart と同じく track_stock=false（既定「追跡しない」）で作り、
--     価格カード（variant）は空の汎用1枚だけ作る（list_price=null＝希望小売価格は定価に入れない）。
--
-- 二重投入の防止:
--   - 納品書番号（delivery_note_no）を任意で記録する。同じ番号での既入庫はアプリ側で警告する
--     （強制ブロックはしない）。DB側は UNIQUE 制約を張らない（同番号の再入庫を運用判断で許すため）。
--
-- RLS / 権限:
--   - 既存 parts_inventory と同じ流儀（user_id = auth.uid() の単純ポリシー4本）。
--   - RPC は SECURITY INVOKER。呼び出しユーザーの権限＋RLSで全ての読み書きが評価される
--     （＝他テナントのデータには触れない）。
--
-- 本番 DB へは Supabase SQL Editor から手動適用すること（prod MCP は読み取り専用）。dev は解約済みのため適用先は prod のみ。

BEGIN;

-- ============================================
-- 1) parts_stock_in_batches: 貼り付け入庫のバッチ（納品書1回ぶんの入庫）
--    明細行は stock_movements(batch_id) 側が担う（このバッチに紐づく 'in' 行が入庫内容）。
-- ============================================
CREATE TABLE IF NOT EXISTS public.parts_stock_in_batches (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delivery_note_no  text,          -- 納品書番号（任意）。二重投入の警告に使う
  supplier          text,          -- 仕入先（任意・メモ用）
  note              text,          -- 備考（任意）
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- 同一テナント・同一納品書番号の既存バッチを高速に引く（二重投入の警告）。
CREATE INDEX IF NOT EXISTS parts_stock_in_batches_user_note_idx
  ON public.parts_stock_in_batches(user_id, delivery_note_no)
  WHERE delivery_note_no IS NOT NULL;

ALTER TABLE public.parts_stock_in_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY parts_stock_in_batches_owner_select ON public.parts_stock_in_batches
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY parts_stock_in_batches_owner_insert ON public.parts_stock_in_batches
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY parts_stock_in_batches_owner_update ON public.parts_stock_in_batches
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY parts_stock_in_batches_owner_delete ON public.parts_stock_in_batches
  FOR DELETE USING (user_id = auth.uid());

-- Supabase の既定権限（postgres が public に作るテーブルは anon/authenticated/service_role に付与）に加え、
-- 明示的にも付与しておく（既存テーブルに合わせ authenticated / service_role が DML できる状態にする）。
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parts_stock_in_batches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parts_stock_in_batches TO service_role;

-- ============================================
-- 2) stock_movements に batch_id を追加（加算的・nullable）
--    貼り付け入庫で作る 'in' 行だけがこのバッチを指す。既存の入庫/棚卸/出庫は null のまま無影響。
-- ============================================
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS batch_id uuid
  REFERENCES public.parts_stock_in_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS stock_movements_batch_idx
  ON public.stock_movements(batch_id)
  WHERE batch_id IS NOT NULL;

-- ============================================
-- 3) commit_paste_stock_in: 確定処理（1トランザクション＝全部かゼロか）
--    p_lines は行の配列。各行は以下の形（アプリ側で組み立てる）:
--      既存部品: { "action":"existing", "part_id":uuid, "quantity":num,
--                  "unit_cost":num|null, "update_cost":bool }
--        - stock_quantity += quantity
--        - update_cost=true かつ unit_cost が非null のときのみ cost_price = unit_cost（原価更新）
--        - 'in' の履歴を batch_id 付きで記録（unit_cost=実際に支払った単価＝納品書の単価）
--      新規部品: { "action":"new", "name":text, "external_code":text|null, "unit":text|null,
--                  "supplier":text|null, "quantity":num, "unit_cost":num|null }
--        - parts_inventory を track_stock=false・stock_quantity=quantity で作成
--        - 空の汎用 variant を1枚作成（list_price=null＝希望小売価格は定価に入れない）
--        - 'in' の履歴を batch_id 付きで記録
--    戻り値: { "batch_id":uuid, "created":int, "updated":int }
-- ============================================
CREATE OR REPLACE FUNCTION public.commit_paste_stock_in(
  p_delivery_note_no text,
  p_supplier text,
  p_note text,
  p_lines jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_batch_id  uuid;
  v_line      jsonb;
  v_action    text;
  v_part_id   uuid;
  v_qty       numeric;
  v_unit_cost numeric;
  v_name      text;
  v_new_id    uuid;
  v_order     integer;
  v_created   integer := 0;
  v_updated   integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'no lines to commit';
  END IF;

  INSERT INTO public.parts_stock_in_batches (user_id, delivery_note_no, supplier, note)
  VALUES (
    v_uid,
    NULLIF(btrim(coalesce(p_delivery_note_no, '')), ''),
    NULLIF(btrim(coalesce(p_supplier, '')), ''),
    NULLIF(btrim(coalesce(p_note, '')), '')
  )
  RETURNING id INTO v_batch_id;

  FOR v_line IN SELECT jsonb_array_elements(p_lines)
  LOOP
    v_action := v_line->>'action';
    v_qty := NULLIF(v_line->>'quantity', '')::numeric;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'invalid quantity in line: %', v_line;
    END IF;
    v_unit_cost := NULLIF(v_line->>'unit_cost', '')::numeric;
    IF v_unit_cost IS NOT NULL AND v_unit_cost < 0 THEN
      RAISE EXCEPTION 'invalid unit_cost in line: %', v_line;
    END IF;

    IF v_action = 'existing' THEN
      v_part_id := NULLIF(v_line->>'part_id', '')::uuid;
      IF v_part_id IS NULL THEN
        RAISE EXCEPTION 'part_id required for existing line';
      END IF;
      -- 所有確認＋行ロック（同一部品への並行入庫を直列化。在庫RPCとは別テーブル観点だが、
      -- 加算の取りこぼしを防ぐため対象行のみロックする）。
      PERFORM 1 FROM public.parts_inventory
        WHERE id = v_part_id AND user_id = v_uid
        FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'part not found or not owned: %', v_part_id;
      END IF;

      UPDATE public.parts_inventory
        SET stock_quantity = stock_quantity + v_qty,
            cost_price = CASE
              WHEN coalesce((v_line->>'update_cost')::boolean, false) AND v_unit_cost IS NOT NULL
              THEN v_unit_cost
              ELSE cost_price
            END
        WHERE id = v_part_id AND user_id = v_uid;

      INSERT INTO public.stock_movements
        (user_id, part_id, movement_type, quantity, unit_cost, memo, batch_id)
      VALUES
        (v_uid, v_part_id, 'in', v_qty, v_unit_cost, '貼り付け入庫', v_batch_id);

      v_updated := v_updated + 1;

    ELSIF v_action = 'new' THEN
      v_name := NULLIF(btrim(coalesce(v_line->>'name', '')), '');
      IF v_name IS NULL THEN
        RAISE EXCEPTION 'name required for new line';
      END IF;

      -- 新規は一覧の一番上に出す（既存最小 - 1、無ければ 0）。createPart と同じ流儀。
      SELECT coalesce(min(display_order) - 1, 0) INTO v_order
        FROM public.parts_inventory WHERE user_id = v_uid;

      INSERT INTO public.parts_inventory
        (user_id, name, external_code, unit, supplier, cost_price, stock_quantity, track_stock, display_order)
      VALUES
        (
          v_uid,
          v_name,
          NULLIF(btrim(coalesce(v_line->>'external_code', '')), ''),
          NULLIF(btrim(coalesce(v_line->>'unit', '')), ''),
          NULLIF(btrim(coalesce(v_line->>'supplier', '')), ''),
          coalesce(v_unit_cost, 0),
          v_qty,
          false,
          v_order
        )
      RETURNING id INTO v_new_id;

      -- 部品は必ず価格カードを1枚持つ運用に合わせ、空の汎用 variant を作る。
      -- list_price は null（＝納品書の希望小売価格は定価に入れない）。
      INSERT INTO public.parts_inventory_variants
        (user_id, part_id, part_number, list_price, markup_rate, vehicle_tags, display_order)
      VALUES
        (v_uid, v_new_id, NULL, NULL, NULL, '{}'::text[], 0);

      INSERT INTO public.stock_movements
        (user_id, part_id, movement_type, quantity, unit_cost, memo, batch_id)
      VALUES
        (v_uid, v_new_id, 'in', v_qty, v_unit_cost, '貼り付け入庫（新規登録）', v_batch_id);

      v_created := v_created + 1;

    ELSE
      RAISE EXCEPTION 'unknown action: %', v_action;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('batch_id', v_batch_id, 'created', v_created, 'updated', v_updated);
END;
$$;

REVOKE ALL ON FUNCTION public.commit_paste_stock_in(text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_paste_stock_in(text, text, text, jsonb) TO authenticated;

COMMIT;
