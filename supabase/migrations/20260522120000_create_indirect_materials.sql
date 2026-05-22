-- 間接材料: メニューに紐づく標準使用量と、deduct RPC の間接材料対応（Step 5）。
-- 本番 DB へは Supabase ダッシュボード or CLI から手動適用すること。

CREATE TABLE IF NOT EXISTS work_menu_indirect_materials (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid NOT NULL REFERENCES work_menu_items(id) ON DELETE CASCADE,
  part_id      uuid NOT NULL REFERENCES parts_inventory(id) ON DELETE RESTRICT,
  quantity     numeric NOT NULL DEFAULT 1,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS work_menu_indirect_materials_menu_idx
  ON work_menu_indirect_materials(menu_item_id);

ALTER TABLE work_menu_indirect_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_menu_indirect_materials_owner_select
  ON work_menu_indirect_materials
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM work_menu_items m
            WHERE m.id = menu_item_id AND m.user_id = auth.uid())
  );
CREATE POLICY work_menu_indirect_materials_owner_insert
  ON work_menu_indirect_materials
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM work_menu_items m
            WHERE m.id = menu_item_id AND m.user_id = auth.uid())
  );
CREATE POLICY work_menu_indirect_materials_owner_update
  ON work_menu_indirect_materials
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM work_menu_items m
            WHERE m.id = menu_item_id AND m.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM work_menu_items m
            WHERE m.id = menu_item_id AND m.user_id = auth.uid())
  );
CREATE POLICY work_menu_indirect_materials_owner_delete
  ON work_menu_indirect_materials
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM work_menu_items m
            WHERE m.id = menu_item_id AND m.user_id = auth.uid())
  );

-- deduct_order_stock を間接材料対応に更新（直接部品の処理は従来通り）。
-- items[i].indirect_materials: [{part_id, quantity, cost_price}, ...] を走査し、
-- 各エントリで (entry.quantity * item.quantity) 分の在庫を減らす + 'out' 履歴を残す。
-- 反転（reverse_order_stock_deduction）は履歴ベースなので変更不要。
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
  v_indirect         jsonb;
  v_part_id          uuid;
  v_line_qty         numeric;
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
    UPDATE orders SET stock_deducted = true, stock_deducted_at = now()
     WHERE id = p_order_id AND user_id = v_user_id;
    RETURN jsonb_build_object('deducted_count', 0);
  END IF;

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
        (user_id, part_id, movement_type, quantity, related_order_id, memo)
      VALUES
        (v_user_id, v_part_id, 'out', -v_line_qty, p_order_id, '受注の在庫引き');
      v_deducted_count := v_deducted_count + 1;
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
              (user_id, part_id, movement_type, quantity, related_order_id, memo)
            VALUES
              (v_user_id, v_part_id, 'out', -v_qty, p_order_id, '受注の在庫引き（間接材料）');
            v_deducted_count := v_deducted_count + 1;
          END IF;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  UPDATE orders SET stock_deducted = true, stock_deducted_at = now()
   WHERE id = p_order_id AND user_id = v_user_id;

  RETURN jsonb_build_object('deducted_count', v_deducted_count);
END;
$$;
