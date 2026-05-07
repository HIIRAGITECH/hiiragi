"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  ESTIMATE_STATUSES,
  INVOICE_STATUSES,
  WORK_STATUSES,
  type EstimateStatus,
  type InvoiceStatus,
  type OrderItem,
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
type OrderPayload = {
  customer_id: string;
  vehicle_id: string | null;
  reception_date: string;
  notes: string | null;
  estimate_notes: string | null;
  invoice_notes: string | null;
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
    estimate_notes: pickString(formData, "estimate_notes"),
    invoice_notes: pickString(formData, "invoice_notes"),
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

  const { error } = await supabase
    .from("orders")
    .insert({ ...result, user_id: user.id });
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
function parseItems(json: string): OrderItem[] | null {
  try {
    const raw = JSON.parse(json);
    if (!Array.isArray(raw)) return null;
    const items: OrderItem[] = [];
    for (const r of raw) {
      const name = typeof r?.name === "string" ? r.name.trim() : "";
      const quantity = Number(r?.quantity);
      const unit_price = Number(r?.unit_price);
      if (!name) continue; // 品名空の行はスキップ
      if (!Number.isFinite(quantity) || quantity < 0) return null;
      if (!Number.isFinite(unit_price) || unit_price < 0) return null;
      const item: OrderItem = {
        name,
        quantity,
        unit_price: Math.round(unit_price),
      };
      if (r?.type === "shaken") item.type = "shaken";
      if (r?.tax_free === true) item.tax_free = true;
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

export async function updateOrderItems(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const items = parseItems(String(formData.get("items_json") ?? "[]"));
  if (items === null) {
    return { error: "明細の値が不正です。数量・単価は0以上の数値にしてください。" };
  }

  const discount_amount = parseInt0(formData.get("discount_amount"));
  const deposit_amount = parseInt0(formData.get("deposit_amount"));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "認証エラー: 再度ログインしてください。" };
  }

  const { error } = await supabase
    .from("orders")
    .update({ items, discount_amount, deposit_amount })
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

export async function updatePhotoFolderUrl(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const raw = String(formData.get("photo_folder_url") ?? "").trim();
  const value = raw === "" ? null : raw;

  if (value !== null && !/^https?:\/\//i.test(value)) {
    return { error: "URLは http:// または https:// で始めてください。" };
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
    .update({ photo_folder_url: value })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return { error: `保存に失敗しました: ${error.message}` };
  }

  revalidatePath(`/dashboard/orders/${id}`);
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
// '請求済' なら invoiced_at を初回 now() に。任意で payment_due_date を保存可能。
// '入金済' なら paid_at を初回 now() に（invoiced_at が未設定なら同時に埋める）。
// '未請求' に戻す場合は invoiced_at / paid_at / payment_due_date をすべて null にリセット。
export async function updateInvoiceStatus(
  id: string,
  next: InvoiceStatus,
  paymentDueDate?: string, // YYYY-MM-DD（請求済への変更時のみ意味あり）
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
    .select("invoiced_at, paid_at, payment_due_date")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  const nowIso = new Date().toISOString();
  let invoiced_at: string | null = current?.invoiced_at ?? null;
  let paid_at: string | null = current?.paid_at ?? null;
  let payment_due_date: string | null =
    (current?.payment_due_date as string | null | undefined) ?? null;

  if (next === "未請求") {
    invoiced_at = null;
    paid_at = null;
    payment_due_date = null;
  } else if (next === "請求済") {
    if (!invoiced_at) invoiced_at = nowIso;
    paid_at = null;
    if (paymentDueDate !== undefined) {
      payment_due_date = paymentDueDate || null;
    }
  } else if (next === "入金済") {
    if (!invoiced_at) invoiced_at = nowIso;
    if (!paid_at) paid_at = nowIso;
  }

  const { error } = await supabase
    .from("orders")
    .update({
      invoice_status: next,
      invoiced_at,
      paid_at,
      payment_due_date,
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: `更新に失敗しました: ${error.message}` };

  revalidatePath("/dashboard/orders");
  revalidatePath(`/dashboard/orders/${id}`);
  revalidatePath("/dashboard/sales");
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
