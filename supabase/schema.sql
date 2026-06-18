-- HIIRAGI 顧客・車両・受注 管理スキーマ参照（実行はユーザ環境で完了済み想定）
-- アプリは以下の列を参照する。実DBがこのスキーマと一致することを前提とする。
-- 新規環境はこのファイルを上から順に流せば再現可能。

-- ============================================================
-- 採番カウンタ（ユーザ別）
-- customers/vehicles/orders の id はユーザごとに 1 から採番する。
-- last_seq は INSERT...ON CONFLICT でアトミックに更新。
-- ============================================================

CREATE TABLE IF NOT EXISTS customer_seq (
  user_id   uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_seq  integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id)
);

CREATE TABLE IF NOT EXISTS vehicle_seq (
  user_id   uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_seq  integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id)
);

ALTER TABLE customer_seq ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_seq  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_seq_owner ON customer_seq;
CREATE POLICY customer_seq_owner ON customer_seq
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS vehicle_seq_owner ON vehicle_seq;
CREATE POLICY vehicle_seq_owner ON vehicle_seq
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- customers / vehicles
-- 複合 PK (user_id, id) によりユーザ別の id 採番（CU0001 等）が衝突しない。
-- 子の FK も (user_id, parent_id) で複合参照する。
-- ============================================================

CREATE TABLE IF NOT EXISTS customers (
  id           text NOT NULL,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         text NOT NULL,
  name_kana    text,
  phone        text,
  email        text,
  postal_code  text,
  address      text,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS vehicles (
  id            text NOT NULL,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id   text NOT NULL,
  plate_number  text,
  maker         text,
  model         text,
  model_year    integer,
  color         text,
  vin           text,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, customer_id) REFERENCES customers(user_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS customers_user_id_idx    ON customers(user_id);
CREATE INDEX IF NOT EXISTS vehicles_customer_id_idx ON vehicles(customer_id);
CREATE INDEX IF NOT EXISTS vehicles_user_id_idx     ON vehicles(user_id);

-- ID 自動採番トリガ（CU0001 / VH0001 形式、4桁未満はゼロ埋め、5桁以上はそのまま伸長）
CREATE OR REPLACE FUNCTION assign_customer_id() RETURNS trigger AS $$
DECLARE
  v_seq integer;
BEGIN
  IF NEW.id IS NULL OR NEW.id = '' THEN
    INSERT INTO customer_seq (user_id, last_seq)
    VALUES (NEW.user_id, 1)
    ON CONFLICT (user_id) DO UPDATE
      SET last_seq = customer_seq.last_seq + 1
    RETURNING last_seq INTO v_seq;

    NEW.id := 'CU' || LPAD(v_seq::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION assign_vehicle_id() RETURNS trigger AS $$
DECLARE
  v_seq integer;
BEGIN
  IF NEW.id IS NULL OR NEW.id = '' THEN
    INSERT INTO vehicle_seq (user_id, last_seq)
    VALUES (NEW.user_id, 1)
    ON CONFLICT (user_id) DO UPDATE
      SET last_seq = vehicle_seq.last_seq + 1
    RETURNING last_seq INTO v_seq;

    NEW.id := 'VH' || LPAD(v_seq::text, 4, '0');
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
-- 受注（フェーズ4 + フェーズ5/6 拡張）
-- 管理番号: YY + "MB-" + 4桁連番。ユーザ毎・年毎にカウンタ別管理。
-- 明細 items は jsonb 配列。割引・預かり金は整数（円）。
-- 写真フォルダURLは Google Drive 等の外部ストレージ URL。
-- vehicle_id は NULL 許容（車両未登録の段階で受注を立てるケース対応）。
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
  id                text NOT NULL,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id       text NOT NULL,
  vehicle_id        text,
  reception_date    date NOT NULL DEFAULT current_date,
  work_status       text NOT NULL DEFAULT '受付'
    CHECK (work_status IN ('受付','作業中','完了')),
  estimate_status   text NOT NULL DEFAULT '未作成'
    CHECK (estimate_status IN ('未作成','発行済','了承済')),
  invoice_status    text NOT NULL DEFAULT '未請求'
    CHECK (invoice_status IN ('未請求','請求済','入金済')),
  invoiced_at       timestamptz, -- 請求書発行日（売上計上の基準日）
  paid_at           timestamptz, -- 入金確認日
  payment_due_date  date,        -- 振込期限（請求書フッタ表示用、任意）
  invoice_subject   text,        -- 請求書の件名（合計金額の上に表示、任意。見積書には出さない）
  is_archived       boolean NOT NULL DEFAULT false,
  notes             text,                 -- 入荷時メモ（受注一覧表示用、帳票には出さない）
  estimate_notes    text,                 -- 見積書 PDF / プレビュー の備考（顧客向け）
  invoice_notes     text,                 -- 請求書 PDF / プレビュー の備考（顧客向け）
  items             jsonb   NOT NULL DEFAULT '[]'::jsonb,
  discount_amount   integer NOT NULL DEFAULT 0,
  deposit_amount    integer NOT NULL DEFAULT 0,
  photo_folder_url  text,
  drive_folder_id   text,        -- アプリが作った受注子フォルダの Drive ID（冪等判定用）
  mypage_token      text,        -- お客様マイページURLのトークン（発行時セット、未発行はNULL）
  mypage_expires_at timestamptz, -- マイページURLの有効期限（発行日+45日、未発行はNULL）
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, customer_id) REFERENCES customers(user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, vehicle_id)  REFERENCES vehicles(user_id, id)  ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS orders_user_id_idx     ON orders(user_id);
CREATE INDEX IF NOT EXISTS orders_customer_id_idx ON orders(customer_id);
CREATE INDEX IF NOT EXISTS orders_vehicle_id_idx  ON orders(vehicle_id);
CREATE INDEX IF NOT EXISTS orders_invoiced_at_idx ON orders(invoiced_at);
CREATE INDEX IF NOT EXISTS orders_is_archived_idx ON orders(is_archived);
-- 発行済みマイページトークンの一意性を保証（未発行=NULL は対象外）。
CREATE UNIQUE INDEX IF NOT EXISTS orders_mypage_token_key
  ON orders (mypage_token) WHERE mypage_token IS NOT NULL;

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

-- =============================================================
-- お客様マイページ（段階3）: トークンで1件＋関連顧客・車両の「見せてよい列」を返す
-- SECURITY DEFINER 関数。service_role には orders/customers/vehicles の GRANT を与えず、
-- この関数だけ EXECUTE を service_role に許可する（最小権限）。
-- 期限切れ判定は loader 側（mypage_expires_at を返すだけ）。
-- =============================================================
CREATE OR REPLACE FUNCTION public.mypage_get_by_token(p_token text)
RETURNS TABLE (
  order_id            text,
  work_status         text,
  estimate_status     text,
  invoice_status      text,
  reception_date      date,
  items               jsonb,
  discount_amount     integer,
  deposit_amount      integer,
  photo_folder_url    text,
  payment_due_date    date,
  invoice_notes       text,
  invoiced_at         timestamptz,
  paid_at             timestamptz,
  mypage_expires_at   timestamptz,
  order_user_id       uuid,
  customer_id         text,
  customer_name       text,
  vehicle_maker       text,
  vehicle_model       text,
  vehicle_model_year  integer,
  vehicle_color       text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT
    o.id, o.work_status, o.estimate_status, o.invoice_status, o.reception_date,
    o.items, o.discount_amount, o.deposit_amount, o.photo_folder_url,
    o.payment_due_date, o.invoice_notes, o.invoiced_at, o.paid_at,
    o.mypage_expires_at, o.user_id, o.customer_id,
    c.name, v.maker, v.model, v.model_year, v.color
  FROM public.orders o
  LEFT JOIN public.customers c ON c.user_id = o.user_id AND c.id = o.customer_id
  LEFT JOIN public.vehicles  v ON v.user_id = o.user_id AND v.id = o.vehicle_id
  WHERE o.mypage_token = p_token
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.mypage_get_by_token(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mypage_get_by_token(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mypage_get_by_token(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mypage_get_by_token(text) TO service_role;

-- =============================================================
-- 作業メニュー（マスター）と作業セット（テンプレート）2026-05 追加
-- =============================================================

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

DROP TRIGGER IF EXISTS work_menu_items_touch_updated_at ON work_menu_items;
CREATE TRIGGER work_menu_items_touch_updated_at
  BEFORE UPDATE ON work_menu_items
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

ALTER TABLE work_menu_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS work_menu_items_owner_select ON work_menu_items;
DROP POLICY IF EXISTS work_menu_items_owner_insert ON work_menu_items;
DROP POLICY IF EXISTS work_menu_items_owner_update ON work_menu_items;
DROP POLICY IF EXISTS work_menu_items_owner_delete ON work_menu_items;
CREATE POLICY work_menu_items_owner_select ON work_menu_items
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY work_menu_items_owner_insert ON work_menu_items
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY work_menu_items_owner_update ON work_menu_items
  FOR UPDATE TO authenticated USING (user_id = auth.uid())
                              WITH CHECK (user_id = auth.uid());
CREATE POLICY work_menu_items_owner_delete ON work_menu_items
  FOR DELETE TO authenticated USING (user_id = auth.uid());


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

DROP TRIGGER IF EXISTS work_menu_sets_touch_updated_at ON work_menu_sets;
CREATE TRIGGER work_menu_sets_touch_updated_at
  BEFORE UPDATE ON work_menu_sets
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

ALTER TABLE work_menu_sets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS work_menu_sets_owner_select ON work_menu_sets;
DROP POLICY IF EXISTS work_menu_sets_owner_insert ON work_menu_sets;
DROP POLICY IF EXISTS work_menu_sets_owner_update ON work_menu_sets;
DROP POLICY IF EXISTS work_menu_sets_owner_delete ON work_menu_sets;
CREATE POLICY work_menu_sets_owner_select ON work_menu_sets
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY work_menu_sets_owner_insert ON work_menu_sets
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY work_menu_sets_owner_update ON work_menu_sets
  FOR UPDATE TO authenticated USING (user_id = auth.uid())
                              WITH CHECK (user_id = auth.uid());
CREATE POLICY work_menu_sets_owner_delete ON work_menu_sets
  FOR DELETE TO authenticated USING (user_id = auth.uid());


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
DROP POLICY IF EXISTS work_menu_set_items_owner_select ON work_menu_set_items;
DROP POLICY IF EXISTS work_menu_set_items_owner_insert ON work_menu_set_items;
DROP POLICY IF EXISTS work_menu_set_items_owner_update ON work_menu_set_items;
DROP POLICY IF EXISTS work_menu_set_items_owner_delete ON work_menu_set_items;
CREATE POLICY work_menu_set_items_owner_select ON work_menu_set_items
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM work_menu_sets s
            WHERE s.id = set_id AND s.user_id = auth.uid())
  );
CREATE POLICY work_menu_set_items_owner_insert ON work_menu_set_items
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM work_menu_sets s
            WHERE s.id = set_id AND s.user_id = auth.uid())
  );
CREATE POLICY work_menu_set_items_owner_update ON work_menu_set_items
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM work_menu_sets s
            WHERE s.id = set_id AND s.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM work_menu_sets s
            WHERE s.id = set_id AND s.user_id = auth.uid())
  );
CREATE POLICY work_menu_set_items_owner_delete ON work_menu_set_items
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM work_menu_sets s
            WHERE s.id = set_id AND s.user_id = auth.uid())
  );
