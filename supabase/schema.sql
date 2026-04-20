-- HIIRAGI 顧客・車両管理スキーマ参照（実行はユーザ環境で完了済み想定）
-- アプリは以下の列を参照する。実DBがこのスキーマと一致することを前提とする。

-- ID 採番用シーケンス
CREATE SEQUENCE IF NOT EXISTS customer_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS vehicle_id_seq START 1;

-- customers
CREATE TABLE IF NOT EXISTS customers (
  id           text PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         text NOT NULL,
  name_kana    text,
  phone        text,
  email        text,
  postal_code  text,
  address      text,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- vehicles（顧客削除時に紐づく車両もカスケード削除）
CREATE TABLE IF NOT EXISTS vehicles (
  id            text PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id   text NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  plate_number  text,
  maker         text,
  model         text,
  model_year    integer,
  color         text,
  vin           text,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customers_user_id_idx ON customers(user_id);
CREATE INDEX IF NOT EXISTS vehicles_customer_id_idx ON vehicles(customer_id);
CREATE INDEX IF NOT EXISTS vehicles_user_id_idx ON vehicles(user_id);

-- ID 自動採番トリガ（CU0001 / VH0001 形式、4桁未満はゼロ埋め、5桁以上はそのまま伸長）
CREATE OR REPLACE FUNCTION assign_customer_id() RETURNS trigger AS $$
BEGIN
  IF NEW.id IS NULL OR NEW.id = '' THEN
    NEW.id := 'CU' || LPAD(nextval('customer_id_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION assign_vehicle_id() RETURNS trigger AS $$
BEGIN
  IF NEW.id IS NULL OR NEW.id = '' THEN
    NEW.id := 'VH' || LPAD(nextval('vehicle_id_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS customers_assign_id ON customers;
CREATE TRIGGER customers_assign_id
  BEFORE INSERT ON customers
  FOR EACH ROW EXECUTE FUNCTION assign_customer_id();

DROP TRIGGER IF EXISTS vehicles_assign_id ON vehicles;
CREATE TRIGGER vehicles_assign_id
  BEFORE INSERT ON vehicles
  FOR EACH ROW EXECUTE FUNCTION assign_vehicle_id();

-- updated_at 自動更新
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS customers_touch_updated_at ON customers;
CREATE TRIGGER customers_touch_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS vehicles_touch_updated_at ON vehicles;
CREATE TRIGGER vehicles_touch_updated_at
  BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- RLS: 認証ユーザは自分が user_id を持つ行のみ RW（ユーザ単位の完全分離）
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles  ENABLE ROW LEVEL SECURITY;

-- 旧ポリシー（authenticated 全件可）が残っている場合に備えて削除
DROP POLICY IF EXISTS customers_authenticated_all ON customers;
DROP POLICY IF EXISTS vehicles_authenticated_all  ON vehicles;

DROP POLICY IF EXISTS customers_owner_select ON customers;
DROP POLICY IF EXISTS customers_owner_insert ON customers;
DROP POLICY IF EXISTS customers_owner_update ON customers;
DROP POLICY IF EXISTS customers_owner_delete ON customers;

CREATE POLICY customers_owner_select ON customers
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY customers_owner_insert ON customers
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY customers_owner_update ON customers
  FOR UPDATE TO authenticated USING (user_id = auth.uid())
                              WITH CHECK (user_id = auth.uid());
CREATE POLICY customers_owner_delete ON customers
  FOR DELETE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS vehicles_owner_select ON vehicles;
DROP POLICY IF EXISTS vehicles_owner_insert ON vehicles;
DROP POLICY IF EXISTS vehicles_owner_update ON vehicles;
DROP POLICY IF EXISTS vehicles_owner_delete ON vehicles;

CREATE POLICY vehicles_owner_select ON vehicles
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY vehicles_owner_insert ON vehicles
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY vehicles_owner_update ON vehicles
  FOR UPDATE TO authenticated USING (user_id = auth.uid())
                              WITH CHECK (user_id = auth.uid());
CREATE POLICY vehicles_owner_delete ON vehicles
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ============================================================
-- 受注（フェーズ4）
-- 管理番号: YY + "MB-" + 4桁連番。ユーザ毎・年毎にカウンタ別管理。
-- ============================================================

CREATE TABLE IF NOT EXISTS order_seq (
  user_id   uuid     NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  year      smallint NOT NULL,
  last_seq  integer  NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, year)
);

ALTER TABLE order_seq ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_seq_owner ON order_seq;
CREATE POLICY order_seq_owner ON order_seq
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS orders (
  id               text PRIMARY KEY,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id      text NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  vehicle_id       text NOT NULL REFERENCES vehicles(id)  ON DELETE CASCADE,
  reception_date   date NOT NULL DEFAULT current_date,
  work_status      text NOT NULL DEFAULT '受付'
    CHECK (work_status IN ('受付','作業中','完了','請求済')),
  estimate_status  text NOT NULL DEFAULT '未作成'
    CHECK (estimate_status IN ('未作成','見積済')),
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_user_id_idx     ON orders(user_id);
CREATE INDEX IF NOT EXISTS orders_customer_id_idx ON orders(customer_id);
CREATE INDEX IF NOT EXISTS orders_vehicle_id_idx  ON orders(vehicle_id);

-- 管理番号採番 trigger
-- INSERT...ON CONFLICT で last_seq をアトミックにインクリメントし、
-- 返ってきた値で 26MB-0001 形式の id を組み立てる。
CREATE OR REPLACE FUNCTION assign_order_id() RETURNS trigger AS $$
DECLARE
  v_year   smallint := EXTRACT(YEAR FROM now())::smallint;
  v_year2  text     := LPAD((v_year % 100)::text, 2, '0');
  v_seq    integer;
BEGIN
  IF NEW.id IS NULL OR NEW.id = '' THEN
    INSERT INTO order_seq (user_id, year, last_seq)
    VALUES (NEW.user_id, v_year, 1)
    ON CONFLICT (user_id, year) DO UPDATE
      SET last_seq = order_seq.last_seq + 1
    RETURNING last_seq INTO v_seq;

    NEW.id := v_year2 || 'MB-' || LPAD(v_seq::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_assign_id ON orders;
CREATE TRIGGER orders_assign_id
  BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION assign_order_id();

DROP TRIGGER IF EXISTS orders_touch_updated_at ON orders;
CREATE TRIGGER orders_touch_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orders_owner_select ON orders;
DROP POLICY IF EXISTS orders_owner_insert ON orders;
DROP POLICY IF EXISTS orders_owner_update ON orders;
DROP POLICY IF EXISTS orders_owner_delete ON orders;

CREATE POLICY orders_owner_select ON orders
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY orders_owner_insert ON orders
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY orders_owner_update ON orders
  FOR UPDATE TO authenticated USING (user_id = auth.uid())
                              WITH CHECK (user_id = auth.uid());
CREATE POLICY orders_owner_delete ON orders
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ============================================================
-- 見積/請求 拡張（フェーズ5）
-- 明細は items jsonb（配列）。割引・預かり金は整数（円）。
-- ============================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS items           jsonb   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS discount_amount integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_amount  integer NOT NULL DEFAULT 0;

-- ============================================================
-- 写真フォルダURL（フェーズ6）
-- 整備写真を Google Drive 等の外部ストレージで管理する想定。
-- ============================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS photo_folder_url text;
