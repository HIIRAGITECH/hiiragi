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

export const WORK_STATUSES = ["受付", "作業中", "完了", "請求済"] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];

export const ESTIMATE_STATUSES = ["未作成", "見積済"] as const;
export type EstimateStatus = (typeof ESTIMATE_STATUSES)[number];

// type 省略時は 'normal'、tax_free 省略時は false として扱う。
// labor_cost / parts_cost は1個あたりの工賃・部品代。両方省略時は unit_price のみが有効な
// 既存データ（単価のみの明細）として扱う。両方を利用する場合は、UI 側で
//   unit_price = (labor_cost ?? 0) + (parts_cost ?? 0)
// が成立するよう保持する。この不変条件を型では強制しない（既存データとの後方互換のため）。
// 金額計算 (calculateTotals / rowSubtotal) は unit_price のみを参照するので、
// labor_cost / parts_cost は表示と編集用途のみ。
export type OrderItem = {
  name: string;
  quantity: number;
  unit_price: number;
  type?: "normal" | "shaken";
  tax_free?: boolean;
  labor_cost?: number;
  parts_cost?: number;
};

export type Order = {
  id: string;
  user_id: string;
  customer_id: string;
  vehicle_id: string | null;
  reception_date: string; // YYYY-MM-DD
  work_status: WorkStatus;
  estimate_status: EstimateStatus;
  notes: string | null;
  items: OrderItem[];
  discount_amount: number;
  deposit_amount: number;
  photo_folder_url: string | null;
  created_at: string;
  updated_at: string;
};

// 設定画面で auth.users.user_metadata に保存
// logo_path / stamp_path は Supabase Storage の shop-assets バケット内の path（署名URLは表示時に生成）
export type ShopInfo = {
  shop_name: string;
  address: string;
  phone: string;
  registration_no: string; // インボイス制度の登録番号
  logo_path: string | null;
  stamp_path: string | null;
};

export type OrderInput = Omit<
  Order,
  "id" | "user_id" | "created_at" | "updated_at"
>;

// 一覧用: 顧客名・車種を join 表示
export type OrderListRow = Pick<
  Order,
  "id" | "reception_date" | "work_status" | "estimate_status"
> & {
  customer: Pick<Customer, "id" | "name"> | null;
  vehicle: Pick<Vehicle, "id" | "model" | "plate_number"> | null;
};
