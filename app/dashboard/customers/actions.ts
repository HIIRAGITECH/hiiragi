"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error: string } | undefined;

function pickString(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}

function pickInt(formData: FormData, key: string): number | null {
  const s = pickString(formData, key);
  if (s === null) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function customerPayload(formData: FormData) {
  return {
    name: pickString(formData, "name"),
    name_kana: pickString(formData, "name_kana"),
    phone: pickString(formData, "phone"),
    email: pickString(formData, "email"),
    postal_code: pickString(formData, "postal_code"),
    address: pickString(formData, "address"),
    notes: pickString(formData, "notes"),
  };
}

function vehiclePayload(formData: FormData) {
  return {
    plate_number: pickString(formData, "plate_number"),
    maker: pickString(formData, "maker"),
    model: pickString(formData, "model"),
    model_year: pickInt(formData, "model_year"),
    color: pickString(formData, "color"),
    vin: pickString(formData, "vin"),
    notes: pickString(formData, "notes"),
  };
}

export async function createCustomer(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const payload = customerPayload(formData);
  if (!payload.name) {
    return { error: "氏名は必須です。" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "認証エラー: 再度ログインしてください。" };
  }

  const { error } = await supabase
    .from("customers")
    .insert({ ...payload, user_id: user.id });
  if (error) {
    return { error: `登録に失敗しました: ${error.message}` };
  }

  revalidatePath("/dashboard/customers");
  redirect("/dashboard/customers");
}

export async function updateCustomer(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const payload = customerPayload(formData);
  if (!payload.name) {
    return { error: "氏名は必須です。" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("customers").update(payload).eq("id", id);
  if (error) {
    return { error: `更新に失敗しました: ${error.message}` };
  }

  revalidatePath("/dashboard/customers");
  revalidatePath(`/dashboard/customers/${id}`);
  redirect(`/dashboard/customers/${id}`);
}

export async function deleteCustomer(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("customers").delete().eq("id", id);

  revalidatePath("/dashboard/customers");
  redirect("/dashboard/customers");
}

export async function createVehicle(
  customerId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const payload = vehiclePayload(formData);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "認証エラー: 再度ログインしてください。" };
  }

  const { error } = await supabase
    .from("vehicles")
    .insert({ ...payload, customer_id: customerId, user_id: user.id });
  if (error) {
    return { error: `登録に失敗しました: ${error.message}` };
  }

  revalidatePath(`/dashboard/customers/${customerId}`);
  redirect(`/dashboard/customers/${customerId}`);
}

export async function updateVehicle(
  customerId: string,
  vehicleId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const payload = vehiclePayload(formData);

  const supabase = await createClient();
  const { error } = await supabase
    .from("vehicles")
    .update(payload)
    .eq("id", vehicleId);
  if (error) {
    return { error: `更新に失敗しました: ${error.message}` };
  }

  revalidatePath(`/dashboard/customers/${customerId}`);
  redirect(`/dashboard/customers/${customerId}`);
}

export async function deleteVehicle(formData: FormData) {
  const customerId = String(formData.get("customer_id") ?? "");
  const vehicleId = String(formData.get("vehicle_id") ?? "");
  if (!customerId || !vehicleId) return;

  const supabase = await createClient();
  await supabase.from("vehicles").delete().eq("id", vehicleId);

  revalidatePath(`/dashboard/customers/${customerId}`);
}
