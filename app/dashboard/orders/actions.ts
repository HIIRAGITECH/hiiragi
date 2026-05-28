"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  ESTIMATE_STATUSES,
  INVOICE_STATUSES,
  TAX_CATEGORIES,
  WORK_STATUSES,
  type EstimateStatus,
  type InvoiceStatus,
  type OrderItem,
  type TaxCategory,
  type WorkStatus,
} from "@/lib/types";

export type FormState = { error: string } | undefined;

function pickString(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}

// ステータス3種は受注フォームから外し、バッジのドロップダウンで変更する。
// 新規作成時は DB の default ('受付' / '未作成' / '未請求') が効く。
// 受注編集フォーム（app/dashboard/orders/order-form.tsx）からの保存ペイロード。
// estimate_notes / invoice_notes は受注詳細画面 (ItemsForm) 側で編集・保存するため
// このペイロードには含めない。ここで触らないことで edit 経由の更新時に詳細画面で
// 入力した備考が消えないようにする。
type OrderPayload = {
  customer_id: string;
  vehicle_id: string | null;
  reception_date: string;
  notes: string | null;
};

function readPayload(formData: FormData): OrderPayload | { error: string } {
  const customer_id = pickString(formData, "customer_id");
  const vehicle_id = pickString(formData, "vehicle_id");
  const reception_date = pickString(formData, "reception_date");

  if (!customer_id) return { error: "顧客を選択してください。" };
  if (!reception_date) return { error: "受付日を入力してください。" };

  return {
    customer_id,
    vehicle_id,
    reception_date,
    notes: pickString(formData, "notes"),
  };
}

export async function createOrder(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = readPayload(formData);
  if ("error" in result) return result;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "認証エラー: 再度ログインしてください。" };
  }

  // 複製モード: hidden duplicate_from で複製元 ID を受け取り、サーバ側で
  // 当該受注の items / discount_amount を読んで新規行にコピーする。
  // クライアントから JSON を流さないので「他ユーザの受注を指す ID」を投げられても
  // RLS + user_id 条件で 0 件になるだけで害なし。
  const duplicateFrom = pickString(formData, "duplicate_from");
  type DuplicatePayload = {
    items: OrderItem[];
    discount_amount: number;
  };
  let dupPayload: DuplicatePayload | null = null;
  if (duplicateFrom) {
    const { data: src } = await supabase
      .from("orders")
      .select("items, discount_amount")
      .eq("id", duplicateFrom)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!src) {
      return { error: "複製元の受注が見つかりません。" };
    }
    dupPayload = {
      items: (src.items ?? []) as OrderItem[],
      discount_amount: Number(src.discount_amount ?? 0),
    };
  }

  const insertPayload: Record<string, unknown> = {
    ...result,
    user_id: user.id,
  };
  if (dupPayload) {
    insertPayload.items = dupPayload.items;
    insertPayload.discount_amount = dupPayload.discount_amount;
  }

  // 複製時は新規 id が必要なので RETURNING して詳細画面へ飛ばす。
  // 通常の新規作成（明細なし）はこれまで通り一覧へ。
  if (dupPayload) {
    const { data: inserted, error } = await supabase
      .from("orders")
      .insert(insertPayload)
      .select("id")
      .single();
    if (error || !inserted) {
      return {
        error: `登録に失敗しました: ${error?.message ?? "不明なエラー"}`,
      };
    }
    revalidatePath("/dashboard/orders");
    redirect(`/dashboard/orders/${inserted.id}`);
  }

  const { error } = await supabase.from("orders").insert(insertPayload);
  if (error) {
    return { error: `登録に失敗しました: ${error.message}` };
  }

  revalidatePath("/dashboard/orders");
  redirect("/dashboard/orders");
}

export async function updateOrder(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = readPayload(formData);
  if ("error" in result) return result;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "認証エラー: 再度ログインしてください。" };
  }

  const { error } = await supabase
    .from("orders")
    .update(result)
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) {
    return { error: `更新に失敗しました: ${error.message}` };
  }

  revalidatePath("/dashboard/orders");
  redirect("/dashboard/orders");
}

export async function deleteOrder(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("orders")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  revalidatePath("/dashboard/orders");
}

// 明細・割引・預かり金の保存。受注詳細画面の明細フォームから呼ばれる。
//
// 2026-05 業務カテゴリ統合:
//   - クライアントから tax_category と item_category_id を受け取り、jsonb に書き込む。
//   - 互換のため、tax_category から旧 type / tax_free を派生して併走書き込みする。
//     カテゴリ名 (車検整備 vs その他) は category_name_map を使って解決する。
//     呼び出し側 (items-form.tsx) が JSON に category_name_map（id→name）を同梱する。
function parseItems(
  json: string,
  categoryNameById: Map<string, string>,
): OrderItem[] | null {
  try {
    const raw = JSON.parse(json);
    if (!Array.isArray(raw)) return null;
    const items: OrderItem[] = [];
    for (const r of raw) {
      const work_name =
        typeof r?.work_name === "string" ? r.work_name.trim() : "";
      const quantity = Number(r?.quantity);
      const unit_price = Number(r?.unit_price);
      if (!work_name) continue; // 品名空の行はスキップ
      if (!Number.isFinite(quantity) || quantity < 0) return null;
      if (!Number.isFinite(unit_price) || unit_price < 0) return null;
      const item: OrderItem = {
        work_name,
        quantity,
        unit_price: Math.round(unit_price),
      };

      // 新フィールド: tax_category / item_category_id
      let tax_category: TaxCategory = "taxable";
      if (typeof r?.tax_category === "string") {
        if (
          (TAX_CATEGORIES as readonly string[]).includes(r.tax_category)
        ) {
          tax_category = r.tax_category as TaxCategory;
        }
      }
      let item_category_id: string | null = null;
      if (typeof r?.item_category_id === "string") {
        const v = r.item_category_id.trim();
        item_category_id = v === "" ? null : v;
      }
      item.tax_category = tax_category;
      item.item_category_id = item_category_id;

      // 旧フィールド (type / tax_free) を派生。
      // shaken_non_tax → type=shaken, tax_free=true
      // taxable && カテゴリ名='車検整備' → type=shaken, tax_free=false
      // それ以外 → type 省略 (=normal), tax_free=false
      const categoryName = item_category_id
        ? (categoryNameById.get(item_category_id) ?? "")
        : "";
      if (tax_category === "shaken_non_tax") {
        item.type = "shaken";
        item.tax_free = true;
      } else if (tax_category === "taxable" && categoryName === "車検整備") {
        item.type = "shaken";
      }
      // それ以外は OrderItem の type 省略 = normal、tax_free 省略 = false。

      // labor_cost / parts_cost: 値が存在し有効な数値なら保存。両方未指定なら
      // 単価のみの既存データと同じ扱いでこれらのプロパティは出力しない。
      if (r?.labor_cost !== undefined && r?.labor_cost !== null) {
        const n = Number(r.labor_cost);
        if (!Number.isFinite(n) || n < 0) return null;
        item.labor_cost = Math.round(n);
      }
      if (r?.parts_cost !== undefined && r?.parts_cost !== null) {
        const n = Number(r.parts_cost);
        if (!Number.isFinite(n) || n < 0) return null;
        item.parts_cost = Math.round(n);
      }
      // 原価（社内管理用、粗利計算に使用）。未指定/空は省略（既存は migration で 0 埋め済み）。
      // PDF・印刷物には出さないこと（InvoiceDocument / printable-document は labor_cost / parts_cost のみ参照）。
      if (r?.labor_cost_price !== undefined && r?.labor_cost_price !== null) {
        const n = Number(r.labor_cost_price);
        if (!Number.isFinite(n) || n < 0) return null;
        item.labor_cost_price = Math.round(n);
      }
      if (r?.parts_cost_price !== undefined && r?.parts_cost_price !== null) {
        const n = Number(r.parts_cost_price);
        if (!Number.isFinite(n) || n < 0) return null;
        item.parts_cost_price = Math.round(n);
      }
      if (typeof r?.part_name === "string") {
        const v = r.part_name.trim();
        item.part_name = v === "" ? null : v;
      }
      if (typeof r?.note === "string") {
        const v = r.note.trim();
        item.note = v === "" ? null : v;
      }
      if (typeof r?.source_menu_id === "string") {
        const v = r.source_menu_id.trim();
        item.source_menu_id = v === "" ? null : v;
      }
      // Step 3: 部品マスター直リンク。Step 4 で在庫減算の特定子に使用する。
      if (typeof r?.linked_part_id === "string") {
        const v = r.linked_part_id.trim();
        item.linked_part_id = v === "" ? null : v;
      }
      // Step 5: 間接材料スナップショット。part_id/quantity/cost_price の配列で受け取る。
      // 不正な要素はスキップ、quantity<=0 や cost_price<0 もスキップ。
      // 不正値で全体を null にすると既存処理（数量/単価 < 0 で null 返却）と紛らわしいため、
      // ここでは弾けるものを弾いて配列をそのまま渡す。
      if (Array.isArray(r?.indirect_materials)) {
        const out: {
          part_id: string;
          quantity: number;
          cost_price: number;
        }[] = [];
        const seen = new Set<string>();
        for (const e of r.indirect_materials) {
          const pid = typeof e?.part_id === "string" ? e.part_id.trim() : "";
          const qty = Number(e?.quantity);
          const cp = Number(e?.cost_price);
          if (!pid || seen.has(pid)) continue;
          if (!Number.isFinite(qty) || qty <= 0) continue;
          if (!Number.isFinite(cp) || cp < 0) continue;
          seen.add(pid);
          out.push({ part_id: pid, quantity: qty, cost_price: cp });
        }
        if (out.length > 0) item.indirect_materials = out;
      }
      items.push(item);
    }
    return items;
  } catch {
    return null;
  }
}

function parseInt0(v: FormDataEntryValue | null): number {
  const n = Number.parseInt(String(v ?? "0"), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// 受注詳細画面の「内容を保存」ボタンで呼ばれる一括保存。
// 明細・割引・預かり金に加えて、見積書備考 / 請求書備考 / 整備写真フォルダ URL も
// ここで一緒に保存する（旧 updatePhotoFolderUrl の役目はこちらに統合済み）。
export async function updateOrderItems(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  // 業務カテゴリの id→name マップ。クライアント側で JSON 化して送ってくる。
  // 旧 type / tax_free 派生のために必要（カテゴリ名が "車検整備" かどうか）。
  const categoryNameById = new Map<string, string>();
  try {
    const raw = JSON.parse(
      String(formData.get("category_name_map_json") ?? "{}"),
    );
    if (raw && typeof raw === "object") {
      for (const [k, v] of Object.entries(raw)) {
        if (typeof v === "string") categoryNameById.set(k, v);
      }
    }
  } catch {
    // 不正でも致命的ではない。空マップで続行（旧 type 派生が "車検整備" 検出に失敗するのみ）。
  }

  const items = parseItems(
    String(formData.get("items_json") ?? "[]"),
    categoryNameById,
  );
  if (items === null) {
    return { error: "明細の値が不正です。数量・単価は0以上の数値にしてください。" };
  }

  const discount_amount = parseInt0(formData.get("discount_amount"));
  const deposit_amount = parseInt0(formData.get("deposit_amount"));
  const estimate_notes = pickString(formData, "estimate_notes");
  const invoice_notes = pickString(formData, "invoice_notes");

  const photo_folder_url = pickString(formData, "photo_folder_url");
  if (photo_folder_url !== null && !/^https?:\/\//i.test(photo_folder_url)) {
    return {
      error: "整備写真フォルダURLは http:// または https:// で始めてください。",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "認証エラー: 再度ログインしてください。" };
  }

  const { error } = await supabase
    .from("orders")
    .update({
      items,
      discount_amount,
      deposit_amount,
      estimate_notes,
      invoice_notes,
      photo_folder_url,
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return { error: `保存に失敗しました: ${error.message}` };
  }

  revalidatePath(`/dashboard/orders/${id}`);
  revalidatePath(`/dashboard/orders/${id}/estimate`);
  revalidatePath(`/dashboard/orders/${id}/invoice`);
  return undefined;
}

// バッジドロップダウンから呼ばれる作業ステータス更新。
export async function updateWorkStatus(
  id: string,
  next: WorkStatus,
): Promise<{ error: string } | undefined> {
  if (!(WORK_STATUSES as readonly string[]).includes(next)) {
    return { error: "不正なステータスです。" };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  const { error } = await supabase
    .from("orders")
    .update({ work_status: next })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: `更新に失敗しました: ${error.message}` };

  revalidatePath("/dashboard/orders");
  revalidatePath(`/dashboard/orders/${id}`);
  return undefined;
}

export async function updateEstimateStatus(
  id: string,
  next: EstimateStatus,
): Promise<{ error: string } | undefined> {
  if (!(ESTIMATE_STATUSES as readonly string[]).includes(next)) {
    return { error: "不正なステータスです。" };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  const { error } = await supabase
    .from("orders")
    .update({ estimate_status: next })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: `更新に失敗しました: ${error.message}` };

  revalidatePath("/dashboard/orders");
  revalidatePath(`/dashboard/orders/${id}`);
  return undefined;
}

// invoice_status の更新。
// '請求済' なら invoiced_at を初回 now() に。任意で payment_due_date / invoice_subject を保存可能。
// '入金済' なら paid_at を初回 now() に（invoiced_at が未設定なら同時に埋める）。
//   paidAt 引数（YYYY-MM-DD）を渡せば、その日付の JST 12:00 を paid_at として保存する。
//   過去の入金日を後から記録できる（入金管理画面の入金確認モーダルから利用）。
// '未請求' に戻す場合は invoiced_at / paid_at / payment_due_date / invoice_subject をすべて null にリセット。
//
// 第3引数 paymentDueDate / 第4引数 invoiceSubject / 第5引数 paidAt は省略可能。
// undefined を渡した場合は既存値を保持する（後方互換）。空文字 "" を渡した場合は null にクリア。
export async function updateInvoiceStatus(
  id: string,
  next: InvoiceStatus,
  paymentDueDate?: string, // YYYY-MM-DD（請求済への変更時のみ意味あり）
  invoiceSubject?: string | null, // 件名（請求済への変更時のみ意味あり）
  paidAt?: string, // YYYY-MM-DD（入金済への変更時のみ意味あり）
): Promise<{ error: string } | undefined> {
  if (!(INVOICE_STATUSES as readonly string[]).includes(next)) {
    return { error: "不正なステータスです。" };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  const { data: current } = await supabase
    .from("orders")
    .select("invoiced_at, paid_at, payment_due_date, invoice_subject")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  const nowIso = new Date().toISOString();
  let invoiced_at: string | null = current?.invoiced_at ?? null;
  let paid_at: string | null = current?.paid_at ?? null;
  let payment_due_date: string | null =
    (current?.payment_due_date as string | null | undefined) ?? null;
  let invoice_subject: string | null =
    (current?.invoice_subject as string | null | undefined) ?? null;

  if (next === "未請求") {
    invoiced_at = null;
    paid_at = null;
    payment_due_date = null;
    invoice_subject = null;
  } else if (next === "請求済") {
    if (!invoiced_at) invoiced_at = nowIso;
    paid_at = null;
    if (paymentDueDate !== undefined) {
      payment_due_date = paymentDueDate || null;
    }
    if (invoiceSubject !== undefined) {
      invoice_subject =
        typeof invoiceSubject === "string" && invoiceSubject.trim() !== ""
          ? invoiceSubject.trim()
          : null;
    }
  } else if (next === "入金済") {
    if (!invoiced_at) invoiced_at = nowIso;
    if (paidAt !== undefined) {
      // YYYY-MM-DD を JST 正午の timestamptz として保存。
      // JST 正午アンカーにすることで、閲覧者のタイムゾーンが UTC ±14h の範囲内なら
      // 同じ日付として表示される（時刻情報は捨てるが日付は安定）。
      paid_at = paidAt ? `${paidAt}T12:00:00+09:00` : null;
    } else if (!paid_at) {
      paid_at = nowIso;
    }
  }

  const { error } = await supabase
    .from("orders")
    .update({
      invoice_status: next,
      invoiced_at,
      paid_at,
      payment_due_date,
      invoice_subject,
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: `更新に失敗しました: ${error.message}` };

  revalidatePath("/dashboard/orders");
  revalidatePath(`/dashboard/orders/${id}`);
  revalidatePath("/dashboard/sales");
  // 入金管理（ダッシュボード + 未回収一覧）も再生成。請求済 → 入金済 への変更で
  // 未回収一覧から行が消える、ダッシュボードの件数バッジが更新される。
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/payments");
  return undefined;
}

// form action 用の薄いラッパー（DeleteButton から hidden id を受けて呼ぶ）
export async function archiveOrderFormAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await updateArchived(id, true);
}

export async function restoreOrderFormAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await updateArchived(id, false);
}

// アーカイブ / 復元
export async function updateArchived(
  id: string,
  archived: boolean,
): Promise<{ error: string } | undefined> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  const { error } = await supabase
    .from("orders")
    .update({ is_archived: archived })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: `更新に失敗しました: ${error.message}` };

  revalidatePath("/dashboard/orders");
  revalidatePath("/dashboard/orders/archive");
  revalidatePath(`/dashboard/orders/${id}`);
  return undefined;
}

// ============================================
// 在庫引き（Step 4）
// ============================================
// 受注詳細画面の「📦 在庫を引く」ボタンから呼ばれる。
// 実体は PL/pgSQL の deduct_order_stock / reverse_order_stock_deduction RPC で、
// 受注行・部品在庫・履歴を 1 トランザクションで更新する。
//
// プレビューは linked_part_id 付き明細を集計し、部品の現在在庫と引き後を返す。
// 同じ part_id を複数明細が指す場合は数量を合算（在庫としては合計を引くため）。

export type StockDeductionPreviewRow = {
  part_id: string;
  part_name: string;
  current_stock: number;
  quantity: number;       // 引く数量（正の値）
  next_stock: number;     // 引き後在庫（負になり得る）
  unit: string | null;
  deleted: boolean;       // 部品が非表示化されている
};

// 直接部品（linked_part_id）と間接材料（indirect_materials）を別セクションで返す。
// UI モーダルが「明細の部品」「間接材料」と分けて表示できるようにするため。
export type StockDeductionPreview =
  | { error: string }
  | {
      already_deducted: boolean;
      stock_deducted_at: string | null;
      direct: StockDeductionPreviewRow[];
      indirect: StockDeductionPreviewRow[];
    };

export async function getStockDeductionPreview(
  orderId: string,
): Promise<StockDeductionPreview> {
  if (!orderId) return { error: "受注 ID が不正です。" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  const { data: order } = await supabase
    .from("orders")
    .select("id, items, stock_deducted, stock_deducted_at")
    .eq("id", orderId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!order) return { error: "受注が見つかりません。" };

  const items = (order.items ?? []) as OrderItem[];
  // 直接部品: linked_part_id ごとに数量合算。
  // 間接材料: 各明細の indirect_materials[*].quantity * 明細 quantity を part_id ごとに合算。
  const directAgg = new Map<string, number>();
  const indirectAgg = new Map<string, number>();
  for (const it of items) {
    const lineQty = Number(it.quantity ?? 0);
    if (!Number.isFinite(lineQty) || lineQty <= 0) continue;
    if (it.linked_part_id) {
      directAgg.set(
        it.linked_part_id,
        (directAgg.get(it.linked_part_id) ?? 0) + lineQty,
      );
    }
    if (Array.isArray(it.indirect_materials)) {
      for (const e of it.indirect_materials) {
        if (!e?.part_id) continue;
        const q = Number(e.quantity ?? 0) * lineQty;
        if (!Number.isFinite(q) || q <= 0) continue;
        indirectAgg.set(e.part_id, (indirectAgg.get(e.part_id) ?? 0) + q);
      }
    }
  }

  const allPartIds = Array.from(
    new Set([...directAgg.keys(), ...indirectAgg.keys()]),
  );

  if (allPartIds.length === 0) {
    return {
      already_deducted: !!order.stock_deducted,
      stock_deducted_at: (order.stock_deducted_at as string | null) ?? null,
      direct: [],
      indirect: [],
    };
  }

  const { data: parts } = await supabase
    .from("parts_inventory")
    .select("id, name, stock_quantity, unit, deleted_at")
    .eq("user_id", user.id)
    .in("id", allPartIds);

  function buildRow(
    pid: string,
    qty: number,
  ): StockDeductionPreviewRow {
    const p = parts?.find((x) => x.id === pid);
    const current = Number(p?.stock_quantity ?? 0);
    return {
      part_id: pid,
      part_name: (p?.name as string) ?? "（不明な部品）",
      current_stock: current,
      quantity: qty,
      next_stock: current - qty,
      unit: (p?.unit as string | null) ?? null,
      deleted: p?.deleted_at != null,
    };
  }

  const direct: StockDeductionPreviewRow[] = [];
  for (const [pid, qty] of directAgg) direct.push(buildRow(pid, qty));
  const indirect: StockDeductionPreviewRow[] = [];
  for (const [pid, qty] of indirectAgg) indirect.push(buildRow(pid, qty));

  return {
    already_deducted: !!order.stock_deducted,
    stock_deducted_at: (order.stock_deducted_at as string | null) ?? null,
    direct,
    indirect,
  };
}

export async function deductStock(
  orderId: string,
): Promise<{ error: string } | { success: true; deducted_count: number }> {
  if (!orderId) return { error: "受注 ID が不正です。" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  const { data, error } = await supabase.rpc("deduct_order_stock", {
    p_order_id: orderId,
  });
  if (error) {
    // PL/pgSQL の RAISE EXCEPTION を読みやすく整形。
    if (error.message.includes("already deducted")) {
      return { error: "この受注は既に在庫引き済みです。" };
    }
    if (error.message.includes("order not found")) {
      return { error: "受注が見つかりません。" };
    }
    return { error: `在庫引きに失敗しました: ${error.message}` };
  }

  const deductedCount =
    (data && typeof data === "object" && "deducted_count" in data
      ? Number((data as { deducted_count: number }).deducted_count)
      : 0) || 0;

  revalidatePath(`/dashboard/orders/${orderId}`);
  revalidatePath("/dashboard/parts-inventory");
  return { success: true, deducted_count: deductedCount };
}

export async function reverseStockDeduction(
  orderId: string,
): Promise<{ error: string } | { success: true; reversed_count: number }> {
  if (!orderId) return { error: "受注 ID が不正です。" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  const { data, error } = await supabase.rpc(
    "reverse_order_stock_deduction",
    { p_order_id: orderId },
  );
  if (error) {
    if (error.message.includes("not deducted")) {
      return { error: "この受注はまだ在庫引きしていません。" };
    }
    if (error.message.includes("order not found")) {
      return { error: "受注が見つかりません。" };
    }
    return { error: `取り消しに失敗しました: ${error.message}` };
  }

  const reversedCount =
    (data && typeof data === "object" && "reversed_count" in data
      ? Number((data as { reversed_count: number }).reversed_count)
      : 0) || 0;

  revalidatePath(`/dashboard/orders/${orderId}`);
  revalidatePath("/dashboard/parts-inventory");
  return { success: true, reversed_count: reversedCount };
}

// 見積書を開く際に呼ぶ。estimate_status を「発行済」に更新してから印刷ページへ遷移する。
// 既に「了承済」の場合は status を変更しない（後退させない）。
export async function openEstimate(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: current } = await supabase
    .from("orders")
    .select("estimate_status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  const currentStatus = (current?.estimate_status ?? "未作成") as EstimateStatus;
  if (currentStatus === "未作成") {
    await supabase
      .from("orders")
      .update({ estimate_status: "発行済" satisfies EstimateStatus })
      .eq("id", id)
      .eq("user_id", user.id);
  }

  revalidatePath(`/dashboard/orders/${id}`);
  revalidatePath("/dashboard/orders");
  redirect(`/dashboard/orders/${id}/estimate`);
}
