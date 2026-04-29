"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SettingsFormState =
  | { error: string }
  | { success: true }
  | undefined;

export type AssetUpdateResult = { success: true } | { error: string };

export async function updateShopAsset({
  kind,
  path,
}: {
  kind: "logo" | "stamp";
  path: string | null;
}): Promise<AssetUpdateResult> {
  if (kind !== "logo" && kind !== "stamp") {
    return { error: "不正な種別です。" };
  }

  const supabase = await createClient();
  const key = kind === "logo" ? "logo_path" : "stamp_path";
  const { error } = await supabase.auth.updateUser({
    data: { [key]: path },
  });
  if (error) {
    return { error: `保存に失敗しました: ${error.message}` };
  }

  revalidatePath("/dashboard/settings");
  return { success: true };
}

export async function updateShopInfo(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const shop_name = String(formData.get("shop_name") ?? "").trim();
  if (!shop_name) {
    return { error: "店舗名は必須です。" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    data: {
      shop_name,
      address: String(formData.get("address") ?? "").trim(),
      phone: String(formData.get("phone") ?? "").trim(),
      registration_no: String(formData.get("registration_no") ?? "").trim(),
    },
  });

  if (error) {
    return { error: `保存に失敗しました: ${error.message}` };
  }

  revalidatePath("/dashboard/settings");
  return { success: true };
}
