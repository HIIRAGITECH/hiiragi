"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  ESTIMATE_STATUSES,
  WORK_STATUSES,
  type EstimateStatus,
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

function isWorkStatus(v: string | null): v is WorkStatus {
  return v !== null && (WORK_STATUSES as readonly string[]).includes(v);
}
function isEstimateStatus(v: string | null): v is EstimateStatus {
  return v !== null && (ESTIMATE_STATUSES as readonly string[]).includes(v);
}

type OrderPayload = {
  customer_id: string;
  vehicle_id: string | null;
  reception_date: string;
  work_status: WorkStatus;
  estimate_status: EstimateStatus;
  notes: string | null;
};

function readPayload(formData: FormData): OrderPayload | { error: string } {
  const customer_id = pickString(formData, "customer_id");
  const vehicle_id = pickString(formData, "vehicle_id");
  const reception_date = pickString(formData, "reception_date");
  const work_status = pickString(formData, "work_status");
  const estimate_status = pickString(formData, "estimate_status");

  if (!customer_id) return { error: "顧客を選択してください。" };
  if (!reception_date) return { error: "受付日を入力してください。" };
  if (!isWorkStatus(work_status)) return { error: "作業ステータスが不正です。" };
  if (!isEstimateStatus(estimate_status)) {
    return { error: "見積ステータスが不正です。" };
  }

  return {
    customer_id,
    vehicle_id,
    reception_date,
    work_status,
    estimate_status,
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
  const { error } = await supabase.from("orders").update(result).eq("id", id);
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
  await supabase.from("orders").delete().eq("id", id);

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
  const { error } = await supabase
    .from("orders")
    .update({ items, discount_amount, deposit_amount })
    .eq("id", id);

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
  const { error } = await supabase
    .from("orders")
    .update({ photo_folder_url: value })
    .eq("id", id);

  if (error) {
    return { error: `保存に失敗しました: ${error.message}` };
  }

  revalidatePath(`/dashboard/orders/${id}`);
  return undefined;
}

// 見積書を開く際に呼ぶ。estimate_status を「見積済」に更新してから印刷ページへ遷移する。
export async function openEstimate(id: string) {
  const supabase = await createClient();
  await supabase
    .from("orders")
    .update({ estimate_status: "見積済" satisfies EstimateStatus })
    .eq("id", id);

  revalidatePath(`/dashboard/orders/${id}`);
  revalidatePath("/dashboard/orders");
  redirect(`/dashboard/orders/${id}/estimate`);
}
