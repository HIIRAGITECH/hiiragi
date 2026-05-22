-- 受注に在庫引きフラグを追加 + 在庫引き/取消の RPC 関数を導入（Step 4）。
-- 本番 DB へは Supabase ダッシュボード or CLI から手動適用すること。

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS stock_deducted    boolean NOT NULL DEFAULT false;
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS stock_deducted_at timestamptz;

-- ============================================
-- deduct_order_stock(order_id)
--   - 受注の linked_part_id 付き明細について parts_inventory.stock_quantity を減算
--   - stock_movements に 'out' を記録（quantity は負数、related_order_id=order_id）
--   - orders.stock_deducted=true, stock_deducted_at=now() を立てる
--   - 在庫不足はマイナス許容（呼び出し側で警告のみ）
--   - 既に true の受注を呼ぶとエラー（二重引き防止）
-- ============================================
CREATE OR REPLACE FUNCTION deduct_order_stock(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id          uuid := auth.uid();
  v_already_deducted boolean;
  v_items            jsonb;
  v_item             jsonb;
  v_part_id          uuid;
  v_qty              numeric;
  v_deducted_count   int := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = 'P0001';
  END IF;

  SELECT stock_deducted, items
    INTO v_already_deducted, v_items
    FROM orders
   WHERE id = p_order_id AND user_id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_already_deducted THEN
    RAISE EXCEPTION 'order stock already deducted' USING ERRCODE = 'P0003';
  END IF;

  IF v_items IS NULL OR jsonb_typeof(v_items) <> 'array' THEN
    UPDATE orders
       SET stock_deducted = true, stock_deducted_at = now()
     WHERE id = p_order_id AND user_id = v_user_id;
    RETURN jsonb_build_object('deducted_count', 0);
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    IF v_item ? 'linked_part_id'
       AND v_item ->> 'linked_part_id' IS NOT NULL
       AND v_item ->> 'linked_part_id' <> ''
    THEN
      v_part_id := (v_item ->> 'linked_part_id')::uuid;
      v_qty := COALESCE((v_item ->> 'quantity')::numeric, 0);
      IF v_qty > 0 THEN
        UPDATE parts_inventory
           SET stock_quantity = stock_quantity - v_qty
         WHERE id = v_part_id AND user_id = v_user_id;

        INSERT INTO stock_movements
          (user_id, part_id, movement_type, quantity, related_order_id, memo)
        VALUES
          (v_user_id, v_part_id, 'out', -v_qty, p_order_id, '受注の在庫引き');

        v_deducted_count := v_deducted_count + 1;
      END IF;
    END IF;
  END LOOP;

  UPDATE orders
     SET stock_deducted = true, stock_deducted_at = now()
   WHERE id = p_order_id AND user_id = v_user_id;

  RETURN jsonb_build_object('deducted_count', v_deducted_count);
END;
$$;

-- ============================================
-- reverse_order_stock_deduction(order_id)
--   - 現在の stock_deducted_at 以降に作成された 'out' レコードのみを反転
--     （Deduct→Reverse→Deduct→Reverse でも整合）
--   - 在庫を加算、'in' で戻し履歴を記録
--   - orders.stock_deducted=false, stock_deducted_at=null に戻す
-- ============================================
CREATE OR REPLACE FUNCTION reverse_order_stock_deduction(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id      uuid := auth.uid();
  v_was_deducted boolean;
  v_anchor       timestamptz;
  v_mov          record;
  v_count        int := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = 'P0001';
  END IF;

  SELECT stock_deducted, stock_deducted_at
    INTO v_was_deducted, v_anchor
    FROM orders
   WHERE id = p_order_id AND user_id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_was_deducted THEN
    RAISE EXCEPTION 'order stock not deducted' USING ERRCODE = 'P0004';
  END IF;

  FOR v_mov IN
    SELECT part_id, quantity
      FROM stock_movements
     WHERE user_id = v_user_id
       AND related_order_id = p_order_id
       AND movement_type = 'out'
       AND (v_anchor IS NULL OR created_at >= v_anchor)
  LOOP
    UPDATE parts_inventory
       SET stock_quantity = stock_quantity + ABS(v_mov.quantity)
     WHERE id = v_mov.part_id AND user_id = v_user_id;

    INSERT INTO stock_movements
      (user_id, part_id, movement_type, quantity, related_order_id, memo)
    VALUES
      (v_user_id, v_mov.part_id, 'in', ABS(v_mov.quantity), p_order_id, '受注の在庫引き取消');

    v_count := v_count + 1;
  END LOOP;

  UPDATE orders
     SET stock_deducted = false, stock_deducted_at = NULL
   WHERE id = p_order_id AND user_id = v_user_id;

  RETURN jsonb_build_object('reversed_count', v_count);
END;
$$;
