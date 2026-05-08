"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { WORK_CATEGORIES, type WorkCategory } from "@/lib/types";
import {
  countWorkMenuUsage,
  type WorkMenuUsage,
} from "@/lib/work-menus/usage";

export type FormState = { error: string } | undefined;

function pickString(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}

function pickNumber(formData: FormData, key: string, fallback = 0): number {
  const s = pickString(formData, key);
  if (s === null) return fallback;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function pickCategory(formData: FormData): WorkCategory | null {
  const s = pickString(formData, "category");
  if (!s) return null;
  return (WORK_CATEGORIES as readonly string[]).includes(s)
    ? (s as WorkCategory)
    : null;
}

type Payload = {
  work_name: string;
  part_name: string | null;
  category: WorkCategory;
  default_quantity: number;
  default_unit_price: number;
  default_labor_cost: number;
  default_parts_cost: number;
  tax_free: boolean;
  memo: string | null;
};

function readPayload(formData: FormData): Payload | { error: string } {
  const work_name = pickString(formData, "work_name");
  if (!work_name) return { error: "作業内容は必須です。" };
  const category = pickCategory(formData);
  if (!category) return { error: "カテゴリを選択してください。" };

  return {
    work_name,
    part_name: pickString(formData, "part_name"),
    category,
    default_quantity: pickNumber(formData, "default_quantity", 1),
    default_unit_price: pickNumber(formData, "default_unit_price", 0),
    default_labor_cost: pickNumber(formData, "default_labor_cost", 0),
    default_parts_cost: pickNumber(formData, "default_parts_cost", 0),
    // shaken_tax_free カテゴリ選択時は強制的に tax_free=true（CHECK と整合）
    tax_free:
      category === "shaken_tax_free"
        ? true
        : formData.get("tax_free") === "on",
    memo: pickString(formData, "memo"),
  };
}

export async function createWorkMenu(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = readPayload(formData);
  if ("error" in result) return result;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  // display_order は既存最大値 + 1（同 user_id 内）
  const { data: maxRow } = await supabase
    .from("work_menu_items")
    .select("display_order")
    .eq("user_id", user.id)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder =
    typeof maxRow?.display_order === "number" ? maxRow.display_order + 1 : 0;

  const { error } = await supabase.from("work_menu_items").insert({
    ...result,
    display_order: nextOrder,
    user_id: user.id,
  });
  if (error) return { error: `登録に失敗しました: ${error.message}` };

  revalidatePath("/dashboard/work-menus");
  redirect("/dashboard/work-menus");
}

export async function updateWorkMenu(
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
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  const { error } = await supabase
    .from("work_menu_items")
    .update(result)
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: `更新に失敗しました: ${error.message}` };

  revalidatePath("/dashboard/work-menus");
  redirect("/dashboard/work-menus");
}

// 旧 deleteWorkMenu(FormData) は廃止。新 API は明示的な mode を取る。
//   - 'soft': deleted_at = now() で非表示化（過去明細との紐付け維持、復元可）
//   - 'hard': 物理削除。work_menu_set_items の参照行を先に削除して FK 制約を回避する。
//             セット側の position は再採番せず、UI 表示時に並び順は維持される。
export type DeleteWorkMenuMode = "soft" | "hard";
export type DeleteWorkMenuResult = { error: string } | { success: true };

export async function deleteWorkMenu(
  id: string,
  mode: DeleteWorkMenuMode,
): Promise<DeleteWorkMenuResult> {
  if (!id) return { error: "ID が不正です。" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  if (mode === "soft") {
    const { error } = await supabase
      .from("work_menu_items")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) return { error: `非表示化に失敗しました: ${error.message}` };
    revalidatePath("/dashboard/work-menus");
    revalidatePath("/dashboard/work-menu-sets");
    return { success: true };
  }

  // hard: セット参照を先に削除してから本体を削除する。
  // RLS により他人のセット行は触れない（owner_delete ポリシー）。
  const { error: linkErr } = await supabase
    .from("work_menu_set_items")
    .delete()
    .eq("menu_item_id", id);
  if (linkErr) {
    return { error: `セット参照の削除に失敗しました: ${linkErr.message}` };
  }
  const { error } = await supabase
    .from("work_menu_items")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: `削除に失敗しました: ${error.message}` };

  revalidatePath("/dashboard/work-menus");
  revalidatePath("/dashboard/work-menu-sets");
  return { success: true };
}

// 使用回数の取得（クライアントから呼び出して警告ダイアログに使う）。
export async function getWorkMenuUsageAction(
  id: string,
): Promise<{ error: string } | { success: true; usage: WorkMenuUsage }> {
  if (!id) return { error: "ID が不正です。" };
  try {
    const usage = await countWorkMenuUsage(id);
    return { success: true, usage };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// 非表示メニューを復元する。
export async function restoreWorkMenu(
  id: string,
): Promise<{ error: string } | { success: true }> {
  if (!id) return { error: "ID が不正です。" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  const { error } = await supabase
    .from("work_menu_items")
    .update({ deleted_at: null })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: `復元に失敗しました: ${error.message}` };
  revalidatePath("/dashboard/work-menus");
  return { success: true };
}

export async function duplicateWorkMenu(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: src } = await supabase
    .from("work_menu_items")
    .select(
      "work_name, part_name, category, default_quantity, default_unit_price, default_labor_cost, default_parts_cost, tax_free, memo",
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!src) return;

  const { data: maxRow } = await supabase
    .from("work_menu_items")
    .select("display_order")
    .eq("user_id", user.id)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder =
    typeof maxRow?.display_order === "number" ? maxRow.display_order + 1 : 0;

  const { data: inserted } = await supabase
    .from("work_menu_items")
    .insert({
      ...src,
      work_name: `${src.work_name}（コピー）`,
      display_order: nextOrder,
      user_id: user.id,
    })
    .select("id")
    .single();

  revalidatePath("/dashboard/work-menus");
  if (inserted?.id) {
    redirect(`/dashboard/work-menus/${inserted.id}/edit`);
  }
}

// 受注明細フォームの ☆ ボタンから呼ばれる: 1 行を作業メニューマスターに登録する。
// 補足（note）はマスター対象外なので渡さない。redirect しない、戻り値で id を返す。
export type RegisterMenuPayload = {
  work_name: string;
  part_name: string | null;
  category: WorkCategory;
  default_quantity: number;
  default_unit_price: number;
  default_labor_cost: number;
  default_parts_cost: number;
  tax_free: boolean;
};

export type RegisterMenuResult =
  | { error: string }
  | { success: true; id: string };

export async function registerOrderItemAsMenu(
  payload: RegisterMenuPayload,
): Promise<RegisterMenuResult> {
  if (!payload.work_name || payload.work_name.trim() === "") {
    return { error: "作業内容が空のため登録できません。" };
  }
  if (!(WORK_CATEGORIES as readonly string[]).includes(payload.category)) {
    return { error: "カテゴリが不正です。" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  const { data: maxRow } = await supabase
    .from("work_menu_items")
    .select("display_order")
    .eq("user_id", user.id)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder =
    typeof maxRow?.display_order === "number" ? maxRow.display_order + 1 : 0;

  const { data: inserted, error } = await supabase
    .from("work_menu_items")
    .insert({
      work_name: payload.work_name.trim(),
      part_name: payload.part_name,
      category: payload.category,
      default_quantity: payload.default_quantity,
      default_unit_price: payload.default_unit_price,
      default_labor_cost: payload.default_labor_cost,
      default_parts_cost: payload.default_parts_cost,
      tax_free:
        payload.category === "shaken_tax_free" ? true : payload.tax_free,
      display_order: nextOrder,
      user_id: user.id,
    })
    .select("id")
    .single();
  if (error || !inserted) {
    return { error: `登録に失敗しました: ${error?.message ?? "unknown"}` };
  }

  revalidatePath("/dashboard/work-menus");
  return { success: true, id: inserted.id };
}

// ↑↓ ボタン用: 隣接行と display_order を入れ替える。
export async function moveWorkMenu(
  id: string,
  direction: "up" | "down",
): Promise<{ error: string } | undefined> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  const { data: cur } = await supabase
    .from("work_menu_items")
    .select("id, display_order")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!cur) return { error: "対象が見つかりません。" };

  const op = direction === "up" ? "lt" : "gt";
  const { data: neighbor } = await supabase
    .from("work_menu_items")
    .select("id, display_order")
    .eq("user_id", user.id)
    .filter("display_order", op, cur.display_order)
    .order("display_order", { ascending: direction !== "up" })
    .limit(1)
    .maybeSingle();
  if (!neighbor) return; // 端なので無視

  // 2 行の display_order を入れ替え（衝突回避のため一時値を使う）
  const TEMP = -999_999_999;
  await supabase
    .from("work_menu_items")
    .update({ display_order: TEMP })
    .eq("id", cur.id)
    .eq("user_id", user.id);
  await supabase
    .from("work_menu_items")
    .update({ display_order: cur.display_order })
    .eq("id", neighbor.id)
    .eq("user_id", user.id);
  await supabase
    .from("work_menu_items")
    .update({ display_order: neighbor.display_order })
    .eq("id", cur.id)
    .eq("user_id", user.id);

  revalidatePath("/dashboard/work-menus");
  return undefined;
}
