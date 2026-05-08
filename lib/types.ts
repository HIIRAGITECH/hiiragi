export type Customer = {
  id: string;
  user_id: string;
  name: string;
  name_kana: string | null;
  phone: string | null;
  email: string | null;
  postal_code: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Vehicle = {
  id: string;
  user_id: string;
  customer_id: string;
  plate_number: string | null;
  maker: string | null;
  model: string | null;
  model_year: number | null;
  color: string | null;
  vin: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerInput = Omit<
  Customer,
  "id" | "user_id" | "created_at" | "updated_at"
>;
export type VehicleInput = Omit<
  Vehicle,
  "id" | "user_id" | "customer_id" | "created_at" | "updated_at"
>;

// 作業ステータスは「請求」を含まない。請求は invoice_status に分離。
export const WORK_STATUSES = ["受付", "作業中", "完了"] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];

// 見積ステータス: '未作成' → '発行済'(印刷した) → '了承済'(顧客から了承を得た)
export const ESTIMATE_STATUSES = ["未作成", "発行済", "了承済"] as const;
export type EstimateStatus = (typeof ESTIMATE_STATUSES)[number];

// 請求ステータス: '未請求' → '請求済'(請求書を発行した) → '入金済'(入金を確認した)
export const INVOICE_STATUSES = ["未請求", "請求済", "入金済"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

// 作業メニューカテゴリ。明細マスター (work_menu_items) と OrderItem で共有する。
//   normal           = 通常（整備）
//   shaken           = 車検（課税）
//   shaken_tax_free  = 車検（非課税）
//
// 2026-05 の Step 6-1 で「税区分（tax_category）」と「業務カテゴリ（item_category_id）」に
// 分離した。旧 category / type / tax_free フィールドは過渡期として残し、計算ロジックも
// 引き続きこちらを使用する。新カラムへの完全切替は Step 6-2 以降で実施する。
export const WORK_CATEGORIES = [
  "normal",
  "shaken",
  "shaken_tax_free",
] as const;
export type WorkCategory = (typeof WORK_CATEGORIES)[number];

// 税区分（システム固定）。請求書での課税対象判定に直結する。
//   taxable        = 課税対象（消費税 10% を加算）
//   shaken_non_tax = 車検非課税（自賠責・重量税・印紙代など）
export const TAX_CATEGORIES = ["taxable", "shaken_non_tax"] as const;
export type TaxCategory = (typeof TAX_CATEGORIES)[number];

// 業務カテゴリ（ユーザー定義、work_item_categories テーブル）。
// 既定で「整備」「車検整備」「車検法定費用」の 3 つが is_system=true でシードされる。
export type WorkItemCategory = {
  id: string;
  user_id: string;
  name: string;
  display_order: number;
  // システム既定カテゴリは削除不可（is_system=true）。ユーザー追加分は false。
  is_system: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

// 受注明細（orders.items jsonb 配列の 1 要素）
//
// type 省略時は 'normal'、tax_free 省略時は false として扱う。
// labor_cost / parts_cost は 1 個あたりの工賃・部品代。両方省略時は unit_price のみが
// 有効な既存データ（単価のみの明細）として扱う。両方を利用する場合は、UI 側で
//   unit_price = (labor_cost ?? 0) + (parts_cost ?? 0)
// が成立するよう保持する。この不変条件を型では強制しない（既存データとの後方互換のため）。
// 金額計算 (calculateTotals / rowSubtotal) は unit_price のみを参照するので、
// labor_cost / parts_cost は表示と編集用途のみ。
//
// 2026-05 のスキーマ更新で:
//   - name → work_name にリネーム（DB 側 jsonb キーも一括 rename 済み）
//   - part_name / note / source_menu_id を追加
//     (source_menu_id は work_menu_items への参照。jsonb 内のため DB レベル FK は無し)
//
// 2026-05 Step 6-1:
//   - tax_category / item_category_id を追加（バックフィル済み、旧 type/tax_free と並走）
//     計算ロジックは Step 6-2 以降で段階的に切り替える。
export type OrderItem = {
  work_name: string;
  part_name?: string | null;
  note?: string | null;
  source_menu_id?: string | null;
  quantity: number;
  unit_price: number;
  type?: "normal" | "shaken";
  tax_free?: boolean;
  labor_cost?: number;
  parts_cost?: number;
  // Step 6-1 で追加。既存ロジックは未参照（旧 type/tax_free を使い続ける）。
  tax_category?: TaxCategory;
  item_category_id?: string | null;
};

// 作業メニュー（work_menu_items テーブルの 1 行）
// deleted_at: ソフトデリート時刻。NULL = アクティブ、非 NULL = 非表示状態。
//   非表示メニューは選択モーダルから除外され、一覧では「非表示を含める」ON 時に薄く表示。
//
// Step 6-1 で tax_category / item_category_id を追加（旧 category と並走）。
export type WorkMenuItem = {
  id: string;
  user_id: string;
  work_name: string;
  part_name: string | null;
  category: WorkCategory;
  default_quantity: number;
  default_unit_price: number;
  default_labor_cost: number;
  default_parts_cost: number;
  tax_free: boolean;
  display_order: number;
  memo: string | null;
  deleted_at: string | null;
  // Step 6-1: NOT NULL DEFAULT 'taxable' で追加済み。既存行も全件埋まっている。
  tax_category: TaxCategory;
  // ON DELETE SET NULL のため null になり得る。新規行は通常 not null で運用する。
  item_category_id: string | null;
  created_at: string;
  updated_at: string;
};

// 作業セット（work_menu_sets テーブルの 1 行）
// deleted_at: ソフトデリート時刻（WorkMenuItem と同様）。
export type WorkMenuSet = {
  id: string;
  user_id: string;
  name: string;
  memo: string | null;
  display_order: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

// 作業セットの中身（work_menu_set_items テーブルの 1 行）
export type WorkMenuSetItem = {
  id: string;
  set_id: string;
  menu_item_id: string;
  position: number;
  created_at: string;
};

export type Order = {
  id: string;
  user_id: string;
  customer_id: string;
  vehicle_id: string | null;
  reception_date: string; // YYYY-MM-DD
  work_status: WorkStatus;
  estimate_status: EstimateStatus;
  invoice_status: InvoiceStatus;
  invoiced_at: string | null; // ISO timestamptz、売上計上の基準日
  paid_at: string | null; // ISO timestamptz、入金確認日
  payment_due_date: string | null; // YYYY-MM-DD、振込期限（請求書フッタ表示）
  is_archived: boolean;
  notes: string | null;          // 入荷時メモ（受注一覧でのみ表示、帳票には出さない）
  estimate_notes: string | null; // 見積書帳票の備考
  invoice_notes: string | null;  // 請求書帳票の備考
  items: OrderItem[];
  discount_amount: number;
  deposit_amount: number;
  photo_folder_url: string | null;
  created_at: string;
  updated_at: string;
};

export const BANK_ACCOUNT_TYPES = ["普通", "当座"] as const;
export type BankAccountType = (typeof BANK_ACCOUNT_TYPES)[number];

// 振込先（請求書のフッタに表示）。すべて未入力時は表示しない。
export type BankInfo = {
  bank_name: string;
  branch_name: string;
  account_type: BankAccountType;
  account_number: string;
  account_holder: string;
};

// 設定画面で auth.users.user_metadata に保存
// logo_path / stamp_path は Supabase Storage の shop-assets バケット内の path（署名URLは表示時に生成）
// bank_info は optional のネストオブジェクト（既存ユーザーは undefined のまま）
export type ShopInfo = {
  shop_name: string;
  address: string;
  phone: string;
  registration_no: string; // インボイス制度の登録番号
  logo_path: string | null;
  stamp_path: string | null;
  bank_info?: BankInfo;
};

export type OrderInput = Omit<
  Order,
  "id" | "user_id" | "created_at" | "updated_at"
>;

// 一覧用: 顧客名・車種を join 表示。一覧の検索対象になる列も含む。
export type OrderListRow = Pick<
  Order,
  | "id"
  | "reception_date"
  | "work_status"
  | "estimate_status"
  | "invoice_status"
  | "invoiced_at"
  | "paid_at"
  | "payment_due_date"
  | "is_archived"
  | "notes"
> & {
  customer: Pick<Customer, "id" | "name" | "name_kana"> | null;
  vehicle: Pick<Vehicle, "id" | "maker" | "model" | "plate_number"> | null;
};
