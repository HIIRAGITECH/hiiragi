"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error: string } | undefined;

function pickName(formData: FormData): string | null {
  const v = formData.get("name");
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}

// 新規作成: 末尾に追加（display_order = max + 1）。is_system は false で固定。
export async function createWorkItemCategory(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const name = pickName(formData);
  if (!name) return { error: "カテゴリ名は必須です。" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  const { data: maxRow } = await supabase
    .from("work_item_categories")
    .select("display_order")
    .eq("user_id", user.id)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder =
    typeof maxRow?.display_order === "number" ? maxRow.display_order + 1 : 0;

  const { error } = await supabase.from("work_item_categories").insert({
    user_id: user.id,
    name,
    display_order: nextOrder,
    is_system: false,
  });
  if (error) return { error: `登録に失敗しました: ${error.message}` };

  revalidatePath("/dashboard/work-item-categories");
  redirect("/dashboard/work-item-categories");
}

// 更新: 名前のみ。is_system カテゴリも名前変更は許可（仕様上）。
export async function updateWorkItemCategory(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const name = pickName(formData);
  if (!name) return { error: "カテゴリ名は必須です。" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  const { error } = await supabase
    .from("work_item_categories")
    .update({ name })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: `更新に失敗しました: ${error.message}` };

  revalidatePath("/dashboard/work-item-categories");
  redirect("/dashboard/work-item-categories");
}

// ソフトデリート: is_system=true は拒否。物理削除は提供しない（参照整合のため）。
// 戻り値の usage は将来「使用中なら警告」を出すための拡張用。今回はスキップ可で 0/0 を返す。
export type SoftDeleteResult =
  | { error: string }
  | { success: true; usage: { menuItemCount: number; orderItemCount: number } };

export async function softDeleteWorkItemCategory(
  id: string,
): Promise<SoftDeleteResult> {
  if (!id) return { error: "ID が不正です。" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  const { data: cur } = await supabase
    .from("work_item_categories")
    .select("is_system")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!cur) return { error: "対象が見つかりません。" };
  if (cur.is_system) {
    return { error: "標準カテゴリは削除できません。" };
  }

  const { error } = await supabase
    .from("work_item_categories")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: `非表示化に失敗しました: ${error.message}` };

  revalidatePath("/dashboard/work-item-categories");
  // usage は将来拡張用。今回は使わないので 0 を返す。
  return { success: true, usage: { menuItemCount: 0, orderItemCount: 0 } };
}

export async function restoreWorkItemCategory(
  id: string,
): Promise<{ error: string } | { success: true }> {
  if (!id) return { error: "ID が不正です。" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  const { error } = await supabase
    .from("work_item_categories")
    .update({ deleted_at: null })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: `復元に失敗しました: ${error.message}` };

  revalidatePath("/dashboard/work-item-categories");
  return { success: true };
}

// ↑↓ ボタン用: アクティブ行の隣接と display_order を入れ替える。
// 削除済み行は対象外（is(deleted_at, null) で絞り込む）。
export async function moveWorkItemCategory(
  id: string,
  direction: "up" | "down",
): Promise<{ error: string } | undefined> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  const { data: cur } = await supabase
    .from("work_item_categories")
    .select("id, display_order")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!cur) return { error: "対象が見つかりません。" };

  const op = direction === "up" ? "lt" : "gt";
  const { data: neighbor } = await supabase
    .from("work_item_categories")
    .select("id, display_order")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .filter("display_order", op, cur.display_order)
    .order("display_order", { ascending: direction !== "up" })
    .limit(1)
    .maybeSingle();
  if (!neighbor) return; // 端

  const TEMP = -999_999_999;
  await supabase
    .from("work_item_categories")
    .update({ display_order: TEMP })
    .eq("id", cur.id)
    .eq("user_id", user.id);
  await supabase
    .from("work_item_categories")
    .update({ display_order: cur.display_order })
    .eq("id", neighbor.id)
    .eq("user_id", user.id);
  await supabase
    .from("work_item_categories")
    .update({ display_order: neighbor.display_order })
    .eq("id", cur.id)
    .eq("user_id", user.id);

  revalidatePath("/dashboard/work-item-categories");
  return undefined;
}
