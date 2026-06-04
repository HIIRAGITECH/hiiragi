-- 受注ステータス連動の在庫確保(reserve)/消費(consume) の基盤とRPCを追加する（Step 2）。
--
-- 確定設計:
--   見積 estimate_status → 了承済 : 確保（reserved_quantity += 数量）
--   了承済 から戻す               : 確保解除（reserved_quantity -= 数量）
--   作業 work_status → 完了        : 消費（stock_quantity -= 数量。確保済みなら reserved も同時に -= ）
--   完了 から戻す                  : 消費取消（stock_quantity += 数量。元が確保済みなら reserved += で確保へ戻す）
--   数量対象 = linked_part_id 行(数量=明細quantity) + indirect_materials[](数量= entry.quantity × 明細quantity)
--
-- 重要な実装メモ:
--   - orders.id は text、stock_movements.related_order_id は uuid で型が合わない（既存 deduct RPC が
--     実受注で機能しなかった原因）。本マイグレーションで stock_movements に text の受注リンク列
--     related_order_text_id を加算的に追加し、新RPCはこちらを使う。
--   - 各RPCは原子的(plpgsql)・SECURITY INVOKER・search_path=public・auth.uid() ガード。
--   - 冪等性は orders.reserved_at / consumed_at の有無で担保（既存 deduct の stock_deducted ガードと同思想）。
--   - 数量は orders.items から都度算出（確保/消費済み受注の明細編集は手動「ステータスを戻す」運用が前提）。
--
-- 加算的変更のみ（カラム追加 / CHECK 値の拡張）。既存 stock_deducted / stock_deducted_at /
-- deduct_order_stock / reverse_order_stock_deduction は削除しない（後方互換・保険として残置）。
-- 本番へは dev 検証後に手動適用すること。

BEGIN;

-- 1) orders に確保/消費の時刻フラグを追加（加算的）
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS reserved_at timestamptz,
  ADD COLUMN IF NOT EXISTS consumed_at timestamptz;

-- 2) stock_movements に text の受注リンク列を追加（related_order_id(uuid) は text id を保持できないため）
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS related_order_text_id text;

-- 3) movement_type の許容値を拡張（既存 in/out/adjust を維持し reserve/release を追加。値の拡張のみ）
ALTER TABLE public.stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;
ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_movement_type_check
  CHECK (movement_type IN ('in', 'out', 'adjust', 'reserve', 'release'));

-- 4) RPC: 在庫確保
CREATE OR REPLACE FUNCTION public.reserve_order_stock(p_order_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_user_id     uuid := auth.uid();
  v_reserved_at timestamptz;
  v_consumed_at timestamptz;
  v_items       jsonb;
  v_item        jsonb;
  v_indirect    jsonb;
  v_part_id     uuid;
  v_line_qty    numeric;
  v_qty         numeric;
  v_count       int := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = 'P0001';
  END IF;

  SELECT reserved_at, consumed_at, items
    INTO v_reserved_at, v_consumed_at, v_items
    FROM orders WHERE id = p_order_id AND user_id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  -- 冪等: 既に確保済み or 消費済みなら何もしない
  IF v_reserved_at IS NOT NULL OR v_consumed_at IS NOT NULL THEN
    RETURN jsonb_build_object('reserved_count', 0, 'skipped', true);
  END IF;

  IF v_items IS NOT NULL AND jsonb_typeof(v_items) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
      v_line_qty := COALESCE((v_item ->> 'quantity')::numeric, 0);

      IF v_item ? 'linked_part_id'
         AND v_item ->> 'linked_part_id' IS NOT NULL
         AND v_item ->> 'linked_part_id' <> ''
         AND v_line_qty > 0
      THEN
        v_part_id := (v_item ->> 'linked_part_id')::uuid;
        UPDATE parts_inventory
           SET reserved_quantity = reserved_quantity + v_line_qty
         WHERE id = v_part_id AND user_id = v_user_id;
        INSERT INTO stock_movements
          (user_id, part_id, movement_type, quantity, related_order_text_id, memo)
        VALUES
          (v_user_id, v_part_id, 'reserve', v_line_qty, p_order_id, '受注の在庫確保');
        v_count := v_count + 1;
      END IF;

      IF v_item ? 'indirect_materials'
         AND jsonb_typeof(v_item -> 'indirect_materials') = 'array'
         AND v_line_qty > 0
      THEN
        FOR v_indirect IN SELECT * FROM jsonb_array_elements(v_item -> 'indirect_materials') LOOP
          IF v_indirect ? 'part_id'
             AND v_indirect ->> 'part_id' IS NOT NULL
             AND v_indirect ->> 'part_id' <> ''
          THEN
            v_part_id := (v_indirect ->> 'part_id')::uuid;
            v_qty := COALESCE((v_indirect ->> 'quantity')::numeric, 0) * v_line_qty;
            IF v_qty > 0 THEN
              UPDATE parts_inventory
                 SET reserved_quantity = reserved_quantity + v_qty
               WHERE id = v_part_id AND user_id = v_user_id;
              INSERT INTO stock_movements
                (user_id, part_id, movement_type, quantity, related_order_text_id, memo)
              VALUES
                (v_user_id, v_part_id, 'reserve', v_qty, p_order_id, '受注の在庫確保（間接材料）');
              v_count := v_count + 1;
            END IF;
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  UPDATE orders SET reserved_at = now() WHERE id = p_order_id AND user_id = v_user_id;
  RETURN jsonb_build_object('reserved_count', v_count);
END;
$fn$;

-- 5) RPC: 確保解除
CREATE OR REPLACE FUNCTION public.release_order_reservation(p_order_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_user_id     uuid := auth.uid();
  v_reserved_at timestamptz;
  v_consumed_at timestamptz;
  v_items       jsonb;
  v_item        jsonb;
  v_indirect    jsonb;
  v_part_id     uuid;
  v_line_qty    numeric;
  v_qty         numeric;
  v_count       int := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = 'P0001';
  END IF;

  SELECT reserved_at, consumed_at, items
    INTO v_reserved_at, v_consumed_at, v_items
    FROM orders WHERE id = p_order_id AND user_id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  -- 確保していない、または既に消費済み（消費時に確保→消費へ振替済み）なら何もしない
  IF v_reserved_at IS NULL OR v_consumed_at IS NOT NULL THEN
    RETURN jsonb_build_object('released_count', 0, 'skipped', true);
  END IF;

  IF v_items IS NOT NULL AND jsonb_typeof(v_items) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
      v_line_qty := COALESCE((v_item ->> 'quantity')::numeric, 0);

      IF v_item ? 'linked_part_id'
         AND v_item ->> 'linked_part_id' IS NOT NULL
         AND v_item ->> 'linked_part_id' <> ''
         AND v_line_qty > 0
      THEN
        v_part_id := (v_item ->> 'linked_part_id')::uuid;
        UPDATE parts_inventory
           SET reserved_quantity = reserved_quantity - v_line_qty
         WHERE id = v_part_id AND user_id = v_user_id;
        INSERT INTO stock_movements
          (user_id, part_id, movement_type, quantity, related_order_text_id, memo)
        VALUES
          (v_user_id, v_part_id, 'release', -v_line_qty, p_order_id, '受注の在庫確保解除');
        v_count := v_count + 1;
      END IF;

      IF v_item ? 'indirect_materials'
         AND jsonb_typeof(v_item -> 'indirect_materials') = 'array'
         AND v_line_qty > 0
      THEN
        FOR v_indirect IN SELECT * FROM jsonb_array_elements(v_item -> 'indirect_materials') LOOP
          IF v_indirect ? 'part_id'
             AND v_indirect ->> 'part_id' IS NOT NULL
             AND v_indirect ->> 'part_id' <> ''
          THEN
            v_part_id := (v_indirect ->> 'part_id')::uuid;
            v_qty := COALESCE((v_indirect ->> 'quantity')::numeric, 0) * v_line_qty;
            IF v_qty > 0 THEN
              UPDATE parts_inventory
                 SET reserved_quantity = reserved_quantity - v_qty
               WHERE id = v_part_id AND user_id = v_user_id;
              INSERT INTO stock_movements
                (user_id, part_id, movement_type, quantity, related_order_text_id, memo)
              VALUES
                (v_user_id, v_part_id, 'release', -v_qty, p_order_id, '受注の在庫確保解除（間接材料）');
              v_count := v_count + 1;
            END IF;
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  UPDATE orders SET reserved_at = NULL WHERE id = p_order_id AND user_id = v_user_id;
  RETURN jsonb_build_object('released_count', v_count);
END;
$fn$;

-- 6) RPC: 消費（確保済みなら確保→消費へ振替。在庫マイナス許容）
CREATE OR REPLACE FUNCTION public.consume_order_stock(p_order_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_user_id     uuid := auth.uid();
  v_reserved_at timestamptz;
  v_consumed_at timestamptz;
  v_items       jsonb;
  v_item        jsonb;
  v_indirect    jsonb;
  v_part_id     uuid;
  v_line_qty    numeric;
  v_qty         numeric;
  v_out         int := 0;
  v_rel         int := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = 'P0001';
  END IF;

  SELECT reserved_at, consumed_at, items
    INTO v_reserved_at, v_consumed_at, v_items
    FROM orders WHERE id = p_order_id AND user_id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  -- 冪等・二重消費防止: 既に消費済みなら何もしない
  IF v_consumed_at IS NOT NULL THEN
    RETURN jsonb_build_object('consumed_count', 0, 'skipped', true);
  END IF;

  IF v_items IS NOT NULL AND jsonb_typeof(v_items) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
      v_line_qty := COALESCE((v_item ->> 'quantity')::numeric, 0);

      IF v_item ? 'linked_part_id'
         AND v_item ->> 'linked_part_id' IS NOT NULL
         AND v_item ->> 'linked_part_id' <> ''
         AND v_line_qty > 0
      THEN
        v_part_id := (v_item ->> 'linked_part_id')::uuid;
        UPDATE parts_inventory
           SET stock_quantity = stock_quantity - v_line_qty
         WHERE id = v_part_id AND user_id = v_user_id;
        INSERT INTO stock_movements
          (user_id, part_id, movement_type, quantity, related_order_text_id, memo)
        VALUES
          (v_user_id, v_part_id, 'out', -v_line_qty, p_order_id, '受注の在庫消費');
        v_out := v_out + 1;
        -- 確保済みなら確保ぶんを同時に解除（確保→消費の振替。stock は二重に引かない）
        IF v_reserved_at IS NOT NULL THEN
          UPDATE parts_inventory
             SET reserved_quantity = reserved_quantity - v_line_qty
           WHERE id = v_part_id AND user_id = v_user_id;
          INSERT INTO stock_movements
            (user_id, part_id, movement_type, quantity, related_order_text_id, memo)
          VALUES
            (v_user_id, v_part_id, 'release', -v_line_qty, p_order_id, '受注の確保→消費振替');
          v_rel := v_rel + 1;
        END IF;
      END IF;

      IF v_item ? 'indirect_materials'
         AND jsonb_typeof(v_item -> 'indirect_materials') = 'array'
         AND v_line_qty > 0
      THEN
        FOR v_indirect IN SELECT * FROM jsonb_array_elements(v_item -> 'indirect_materials') LOOP
          IF v_indirect ? 'part_id'
             AND v_indirect ->> 'part_id' IS NOT NULL
             AND v_indirect ->> 'part_id' <> ''
          THEN
            v_part_id := (v_indirect ->> 'part_id')::uuid;
            v_qty := COALESCE((v_indirect ->> 'quantity')::numeric, 0) * v_line_qty;
            IF v_qty > 0 THEN
              UPDATE parts_inventory
                 SET stock_quantity = stock_quantity - v_qty
               WHERE id = v_part_id AND user_id = v_user_id;
              INSERT INTO stock_movements
                (user_id, part_id, movement_type, quantity, related_order_text_id, memo)
              VALUES
                (v_user_id, v_part_id, 'out', -v_qty, p_order_id, '受注の在庫消費（間接材料）');
              v_out := v_out + 1;
              IF v_reserved_at IS NOT NULL THEN
                UPDATE parts_inventory
                   SET reserved_quantity = reserved_quantity - v_qty
                 WHERE id = v_part_id AND user_id = v_user_id;
                INSERT INTO stock_movements
                  (user_id, part_id, movement_type, quantity, related_order_text_id, memo)
                VALUES
                  (v_user_id, v_part_id, 'release', -v_qty, p_order_id, '受注の確保→消費振替（間接材料）');
                v_rel := v_rel + 1;
              END IF;
            END IF;
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  -- reserved_at は「元が確保済みだったか」のマーカーとして保持（unconsume が参照）。
  UPDATE orders SET consumed_at = now() WHERE id = p_order_id AND user_id = v_user_id;
  RETURN jsonb_build_object('consumed_count', v_out, 'released_count', v_rel);
END;
$fn$;

-- 7) RPC: 消費取消（元が確保済みなら確保状態へ戻す）
CREATE OR REPLACE FUNCTION public.unconsume_order_stock(p_order_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_user_id     uuid := auth.uid();
  v_reserved_at timestamptz;
  v_consumed_at timestamptz;
  v_items       jsonb;
  v_item        jsonb;
  v_indirect    jsonb;
  v_part_id     uuid;
  v_line_qty    numeric;
  v_qty         numeric;
  v_in          int := 0;
  v_res         int := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = 'P0001';
  END IF;

  SELECT reserved_at, consumed_at, items
    INTO v_reserved_at, v_consumed_at, v_items
    FROM orders WHERE id = p_order_id AND user_id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;

  -- 未消費なら何もしない
  IF v_consumed_at IS NULL THEN
    RETURN jsonb_build_object('unconsumed_count', 0, 'skipped', true);
  END IF;

  IF v_items IS NOT NULL AND jsonb_typeof(v_items) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
      v_line_qty := COALESCE((v_item ->> 'quantity')::numeric, 0);

      IF v_item ? 'linked_part_id'
         AND v_item ->> 'linked_part_id' IS NOT NULL
         AND v_item ->> 'linked_part_id' <> ''
         AND v_line_qty > 0
      THEN
        v_part_id := (v_item ->> 'linked_part_id')::uuid;
        UPDATE parts_inventory
           SET stock_quantity = stock_quantity + v_line_qty
         WHERE id = v_part_id AND user_id = v_user_id;
        INSERT INTO stock_movements
          (user_id, part_id, movement_type, quantity, related_order_text_id, memo)
        VALUES
          (v_user_id, v_part_id, 'in', v_line_qty, p_order_id, '受注の在庫消費取消');
        v_in := v_in + 1;
        -- 元が確保済みだったら確保状態へ戻す
        IF v_reserved_at IS NOT NULL THEN
          UPDATE parts_inventory
             SET reserved_quantity = reserved_quantity + v_line_qty
           WHERE id = v_part_id AND user_id = v_user_id;
          INSERT INTO stock_movements
            (user_id, part_id, movement_type, quantity, related_order_text_id, memo)
          VALUES
            (v_user_id, v_part_id, 'reserve', v_line_qty, p_order_id, '受注の確保復元');
          v_res := v_res + 1;
        END IF;
      END IF;

      IF v_item ? 'indirect_materials'
         AND jsonb_typeof(v_item -> 'indirect_materials') = 'array'
         AND v_line_qty > 0
      THEN
        FOR v_indirect IN SELECT * FROM jsonb_array_elements(v_item -> 'indirect_materials') LOOP
          IF v_indirect ? 'part_id'
             AND v_indirect ->> 'part_id' IS NOT NULL
             AND v_indirect ->> 'part_id' <> ''
          THEN
            v_part_id := (v_indirect ->> 'part_id')::uuid;
            v_qty := COALESCE((v_indirect ->> 'quantity')::numeric, 0) * v_line_qty;
            IF v_qty > 0 THEN
              UPDATE parts_inventory
                 SET stock_quantity = stock_quantity + v_qty
               WHERE id = v_part_id AND user_id = v_user_id;
              INSERT INTO stock_movements
                (user_id, part_id, movement_type, quantity, related_order_text_id, memo)
              VALUES
                (v_user_id, v_part_id, 'in', v_qty, p_order_id, '受注の在庫消費取消（間接材料）');
              v_in := v_in + 1;
              IF v_reserved_at IS NOT NULL THEN
                UPDATE parts_inventory
                   SET reserved_quantity = reserved_quantity + v_qty
                 WHERE id = v_part_id AND user_id = v_user_id;
                INSERT INTO stock_movements
                  (user_id, part_id, movement_type, quantity, related_order_text_id, memo)
                VALUES
                  (v_user_id, v_part_id, 'reserve', v_qty, p_order_id, '受注の確保復元（間接材料）');
                v_res := v_res + 1;
              END IF;
            END IF;
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  UPDATE orders SET consumed_at = NULL WHERE id = p_order_id AND user_id = v_user_id;
  RETURN jsonb_build_object('unconsumed_count', v_in, 'rereserved_count', v_res);
END;
$fn$;

COMMIT;
