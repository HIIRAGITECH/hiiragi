import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { calculateTotals } from "@/lib/orders/totals";
import type {
  BankAccountType,
  BankInfo,
  EstimateStatus,
  InvoiceStatus,
  OrderItem,
  WorkStatus,
} from "@/lib/types";

// SECURITY DEFINER 関数 mypage_get_by_token(p_token) が返す1行の形。
// 「お客様に見せてよい列」だけが返る（住所/電話/原価などは関数が返さない）。
type MypageRpcRow = {
  order_id: string;
  work_status: WorkStatus;
  estimate_status: EstimateStatus;
  invoice_status: InvoiceStatus;
  reception_date: string;
  items: OrderItem[] | null;
  discount_amount: number | null;
  deposit_amount: number | null;
  photo_folder_url: string | null;
  payment_due_date: string | null;
  invoice_notes: string | null;
  invoiced_at: string | null;
  paid_at: string | null;
  mypage_expires_at: string | null;
  order_user_id: string; // 店舗情報(user_metadata)取得用
  customer_id: string;
  customer_name: string | null;
  vehicle_maker: string | null;
  vehicle_model: string | null;
  vehicle_model_year: number | null;
  vehicle_color: string | null;
};

// ============================================================================
// お客様マイページ 段階3: トークン検証 + データ取得（「誰に見せるか」レイヤー）
// ============================================================================
//
// 設計の核心:
//   - 「トークン検証（誰に見せるか）」を loadMypageByToken に閉じ込める。将来ログイン方式へ
//     移行する場合は、この関数を「ログイン顧客 → その顧客の全 order」に差し替えるだけで、
//     表示コンポーネント（何を見せるか）はそのまま流用できる。
//   - 表示は customer 軸で組む。MypageView.orders は現状トークン由来の 1 件のみだが、
//     将来ログイン化したら同じ customer の複数 order を詰めれば表示はそのまま動く。
//
//   - service role（createAdminClient）で RLS をバイパスして読む。マイページは「ログイン
//     していないお客様」が見るため、ここだけ service role 読み取りが正当。
//     「トークンを知っている＝閲覧権限がある」という設計。
//
//   - ★情報漏洩対策の要★
//     DB 行 → サニタイズ済みビューモデル(MypagePublic*) への変換をこの層で行い、
//     原価・粗利・お客様の住所/電話・内部メモ・業販/定価などを「型の時点で」落とす。
//     表示コンポーネントはサニタイズ後の型しか受け取らないので、構造的に漏洩しようがない。

// ---- サニタイズ済みビューモデル（表示コンポーネントが受け取る唯一の形） ----

// 明細: 原価(cost系) / 定価(list_price) / 間接材料 を含めない。
export type MypageItem = {
  work_name: string;
  part_name: string | null;
  note: string | null; // 明細の備考（見積/請求書にも出る顧客向けメモ）
  quantity: number;
  unit_price: number;
  amount: number; // quantity * unit_price
};

export type MypageTotals = {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  deposit: number;
  balance: number;
};

// 車両: maker / model / model_year / color のみ（vin・notes は出さない）。
export type MypageVehicle = {
  maker: string | null;
  model: string | null;
  model_year: number | null;
  color: string | null;
} | null;

// 顧客: 表示に必要な name のみ（住所・電話・email・メモは持たせない）。
export type MypageCustomer = {
  name: string;
};

// 店舗: 店舗名・店舗の住所/電話（顧客のものではない）・ロゴ・振込先。
export type MypageShop = {
  shop_name: string;
  address: string;
  phone: string;
  logoUrl: string | null;
  bank_info?: BankInfo;
};

export type MypageOrder = {
  id: string;
  reception_date: string;
  work_status: WorkStatus;
  estimate_status: EstimateStatus;
  invoice_status: InvoiceStatus;
  items: MypageItem[];
  totals: MypageTotals;
  invoice_notes: string | null; // invoice_notes は顧客向けのため表示可
  payment_due_date: string | null;
  invoiced_at: string | null;
  paid_at: string | null;
  photo_folder_url: string | null;
  vehicle: MypageVehicle;
};

export type MypageView = {
  shop: MypageShop;
  customer: MypageCustomer;
  // customer 軸。現状はトークン由来の 1 件。将来ログイン化で同顧客の複数 order を詰められる。
  orders: MypageOrder[];
};

// 検証結果の判別共用体。page はこれで画面を出し分ける。
export type MypageLoadResult =
  | { status: "ok"; view: MypageView }
  | { status: "not_found" } // token が NULL / 該当なし
  | { status: "expired" }; // 有効期限切れ

// ---- 変換ヘルパ（漏洩しないフィールドだけ拾う） ----

function toMypageItem(it: OrderItem): MypageItem {
  const quantity = Number(it.quantity ?? 0);
  const unit_price = Number(it.unit_price ?? 0);
  return {
    work_name: it.work_name ?? "",
    part_name: it.part_name ?? null,
    note: it.note ?? null,
    quantity,
    unit_price,
    amount: Math.round(quantity * unit_price),
  };
}

function buildBankInfo(raw: unknown): BankInfo | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Partial<BankInfo>;
  // 全項目空なら表示しない（請求書フッタと同じ流儀）。
  const anyFilled =
    r.bank_name || r.branch_name || r.account_number || r.account_holder;
  if (!anyFilled) return undefined;
  return {
    bank_name: r.bank_name ?? "",
    branch_name: r.branch_name ?? "",
    account_type: (r.account_type === "当座"
      ? "当座"
      : "普通") satisfies BankAccountType,
    account_number: r.account_number ?? "",
    account_holder: r.account_holder ?? "",
  };
}

// ---- メイン: トークン検証 + サニタイズ済みビューを返す ----

// 段階4の方針: 表示ページ側は options.mypage（使用権）を意図的にチェックしない。
//   発行済みURLは有効期限まで有効のまま。理由: お客様には店舗の課金状態は関係なく、
//   一度「見られます」と渡したURLが店の解約で突然死ぬとお客様が混乱する。発行を止めれば十分。
//   （発行/再発行の入口は canUseMypage でゲートしてある）
export async function loadMypageByToken(
  token: string,
): Promise<MypageLoadResult> {
  const t = (token ?? "").trim();
  if (!t) return { status: "not_found" };

  const admin = createAdminClient();

  // 1) トークン検証 + データ取得は SECURITY DEFINER 関数経由（テーブル直読みはしない）。
  //    service_role には orders/customers/vehicles の GRANT を与えていないため、
  //    この関数だけが「トークン一致の1件＋お客様に見せてよい列」を返せる（最小権限）。
  const { data, error } = await admin.rpc("mypage_get_by_token", {
    p_token: t,
  });

  // ★今回の反省点★ error を握りつぶさない。権限/接続エラーと「該当0件」を区別してログする。
  // （以前はテーブル GRANT 不足の権限拒否が黙って not_found に化け、原因特定が困難だった）
  if (error) {
    console.error("[mypage] mypage_get_by_token rpc failed:", error);
    return { status: "not_found" };
  }

  const row = (Array.isArray(data) ? data[0] : null) as MypageRpcRow | null;
  if (!row) return { status: "not_found" };

  // 2) 有効期限チェックは loader 側で行う（関数は mypage_expires_at を返すだけ）。
  //    未設定(null)は安全側で「切れ」扱い（通常は token と対で入る）。
  const exp = row.mypage_expires_at
    ? new Date(row.mypage_expires_at).getTime()
    : null;
  if (exp == null || exp < Date.now()) {
    return { status: "expired" };
  }

  // 3) 店舗情報(user_metadata) は auth admin API で取得（auth 権限なのでテーブル GRANT 不要）。
  const { data: userData, error: userErr } =
    await admin.auth.admin.getUserById(row.order_user_id);
  if (userErr) {
    console.error("[mypage] getUserById failed:", userErr);
  }
  const meta = (userData?.user?.user_metadata ?? {}) as Record<string, unknown>;

  // 4) ロゴ署名URL（shop-assets は private。service role で署名）。
  let logoUrl: string | null = null;
  const logoPath =
    typeof meta.logo_path === "string" && meta.logo_path ? meta.logo_path : null;
  if (logoPath) {
    const { data: signed, error: signErr } = await admin.storage
      .from("shop-assets")
      .createSignedUrl(logoPath, 3600);
    if (signErr) console.error("[mypage] createSignedUrl failed:", signErr);
    logoUrl = signed?.signedUrl ?? null;
  }

  const shop: MypageShop = {
    shop_name: typeof meta.shop_name === "string" ? meta.shop_name : "",
    address: typeof meta.address === "string" ? meta.address : "",
    phone: typeof meta.phone === "string" ? meta.phone : "",
    logoUrl,
    bank_info: buildBankInfo(meta.bank_info),
  };

  const items = (row.items ?? []) as OrderItem[];
  const t0 = calculateTotals(
    items,
    row.discount_amount ?? 0,
    row.deposit_amount ?? 0,
  );

  // 関数が返した平坦な車両列を MypageVehicle に組み直す（全て null なら車両なし）。
  const vehicle: MypageVehicle =
    row.vehicle_maker ||
    row.vehicle_model ||
    row.vehicle_model_year != null ||
    row.vehicle_color
      ? {
          maker: row.vehicle_maker,
          model: row.vehicle_model,
          model_year: row.vehicle_model_year,
          color: row.vehicle_color,
        }
      : null;

  const mypageOrder: MypageOrder = {
    id: row.order_id,
    reception_date: row.reception_date,
    work_status: row.work_status,
    estimate_status: row.estimate_status,
    invoice_status: row.invoice_status,
    items: items
      .filter((it) => (it.work_name ?? "").trim() !== "" || (it.part_name ?? ""))
      .map(toMypageItem),
    totals: {
      subtotal: t0.subtotal,
      discount: t0.discount,
      tax: t0.tax,
      total: t0.total,
      deposit: t0.deposit,
      balance: t0.balance,
    },
    invoice_notes: row.invoice_notes ?? null,
    payment_due_date: row.payment_due_date ?? null,
    invoiced_at: row.invoiced_at ?? null,
    paid_at: row.paid_at ?? null,
    photo_folder_url: row.photo_folder_url ?? null,
    vehicle,
  };

  const view: MypageView = {
    shop,
    customer: { name: row.customer_name ?? "" },
    orders: [mypageOrder],
  };

  return { status: "ok", view };
}
