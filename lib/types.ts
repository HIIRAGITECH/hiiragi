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

export type OrderItem = {
  name: string;
  quantity: number;
  unit_price: number;
};

export type Order = {
  id: string;
  user_id: string;
  customer_id: string;
  vehicle_id: string;
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
export type ShopInfo = {
  shop_name: string;
  address: string;
  phone: string;
  registration_no: string; // インボイス制度の登録番号
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
