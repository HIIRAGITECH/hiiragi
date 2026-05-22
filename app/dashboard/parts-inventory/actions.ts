"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { MovementType } from "@/lib/types";

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

// 売価は任意入力。空のときは null、数値なら ≥0 でなければ null（不正値は記録しない）。
function pickNullableNumber(formData: FormData, key: string): number | null {
  const s = pickString(formData, key);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function pickBool(formData: FormData, key: string): boolean {
  const v = formData.get(key);
  return v === "on" || v === "true" || v === "1";
}

// フォーム共通のペイロード（編集時は initial_stock_quantity を読まない）。
type PartPayload = {
  name: string;
  internal_code: string | null;
  external_code: string | null;
  cost_price: number;
  sale_price: number | null;
  show_in_detail: boolean;
  reorder_point: number;
  supplier: string | null;
  unit: string | null;
  memo: string | null;
};

function readPartPayload(formData: FormData): PartPayload | { error: string } {
  const name = pickString(formData, "name");
  if (!name) return { error: "部品名は必須です。" };
  return {
    name,
    internal_code: pickString(formData, "internal_code"),
    external_code: pickString(formData, "external_code"),
    cost_price: pickNumber(formData, "cost_price", 0),
    sale_price: pickNullableNumber(formData, "sale_price"),
    show_in_detail: pickBool(formData, "show_in_detail"),
    reorder_point: pickNumber(formData, "reorder_point", 0),
    supplier: pickString(formData, "supplier"),
    unit: pickString(formData, "unit"),
    memo: pickString(formData, "memo"),
  };
}

// 新規作成: display_order = 既存最大 + 1。初期在庫があれば stock_movements に 'in' で記録。
export async function createPart(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = readPartPayload(formData);
  if ("error" in result) return result;

  const initial_stock = pickNumber(formData, "initial_stock_quantity", 0);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  const { data: maxRow } = await supabase
    .from("parts_inventory")
    .select("display_order")
    .eq("user_id", user.id)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder =
    typeof maxRow?.display_order === "number" ? maxRow.display_order + 1 : 0;

  const { data: inserted, error } = await supabase
    .from("parts_inventory")
    .insert({
      ...result,
      stock_quantity: initial_stock,
      display_order: nextOrder,
      user_id: user.id,
    })
    .select("id")
    .single();
  if (error || !inserted) {
    return { error: `登録に失敗しました: ${error?.message ?? "unknown"}` };
  }

  // 初期在庫があれば履歴を残す（cost_price を unit_cost として記録）。
  if (initial_stock > 0) {
    await supabase.from("stock_movements").insert({
      user_id: user.id,
      part_id: inserted.id,
      movement_type: "in" satisfies MovementType,
      quantity: initial_stock,
      unit_cost: result.cost_price,
      memo: "初期在庫",
    });
  }

  revalidatePath("/dashboard/parts-inventory");
  redirect("/dashboard/parts-inventory");
}

// 更新: 在庫数 (stock_quantity) は触らない（入庫/棚卸で変える運用）。
export async function updatePart(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = readPartPayload(formData);
  if ("error" in result) return result;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  const { error } = await supabase
    .from("parts_inventory")
    .update(result)
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: `更新に失敗しました: ${error.message}` };

  revalidatePath("/dashboard/parts-inventory");
  redirect("/dashboard/parts-inventory");
}

// 物理削除はしない（Step 3 で受注との連携が始まるため、過去の出庫履歴が孤立するのを避ける）。
// ソフトデリート → 復元のみを提供する。
export async function softDeletePart(
  id: string,
): Promise<{ error: string } | { success: true }> {
  if (!id) return { error: "ID が不正です。" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  const { error } = await supabase
    .from("parts_inventory")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: `非表示化に失敗しました: ${error.message}` };

  revalidatePath("/dashboard/parts-inventory");
  return { success: true };
}

export async function restorePart(
  id: string,
): Promise<{ error: string } | { success: true }> {
  if (!id) return { error: "ID が不正です。" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  const { error } = await supabase
    .from("parts_inventory")
    .update({ deleted_at: null })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: `復元に失敗しました: ${error.message}` };

  revalidatePath("/dashboard/parts-inventory");
  return { success: true };
}

// 複製: 在庫数は引き継がず 0 から開始（同名 → 「（コピー）」サフィックス）。
// 履歴も複製しない。display_order は末尾。
export async function duplicatePart(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: src } = await supabase
    .from("parts_inventory")
    .select(
      "name, internal_code, external_code, cost_price, sale_price, show_in_detail, reorder_point, supplier, unit, memo",
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!src) return;

  const { data: maxRow } = await supabase
    .from("parts_inventory")
    .select("display_order")
    .eq("user_id", user.id)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder =
    typeof maxRow?.display_order === "number" ? maxRow.display_order + 1 : 0;

  const { data: inserted } = await supabase
    .from("parts_inventory")
    .insert({
      ...src,
      name: `${src.name}（コピー）`,
      stock_quantity: 0,
      display_order: nextOrder,
      user_id: user.id,
    })
    .select("id")
    .single();

  revalidatePath("/dashboard/parts-inventory");
  if (inserted?.id) {
    redirect(`/dashboard/parts-inventory/${inserted.id}/edit`);
  }
}

// 並び替え: 隣接行と display_order を入れ替え（フィルタ解除時のみ呼べる UI 想定）。
export async function movePart(
  id: string,
  direction: "up" | "down",
): Promise<{ error: string } | undefined> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  const { data: cur } = await supabase
    .from("parts_inventory")
    .select("id, display_order")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!cur) return { error: "対象が見つかりません。" };

  const op = direction === "up" ? "lt" : "gt";
  const { data: neighbor } = await supabase
    .from("parts_inventory")
    .select("id, display_order")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .filter("display_order", op, cur.display_order)
    .order("display_order", { ascending: direction !== "up" })
    .limit(1)
    .maybeSingle();
  if (!neighbor) return;

  const TEMP = -999_999_999;
  await supabase
    .from("parts_inventory")
    .update({ display_order: TEMP })
    .eq("id", cur.id)
    .eq("user_id", user.id);
  await supabase
    .from("parts_inventory")
    .update({ display_order: cur.display_order })
    .eq("id", neighbor.id)
    .eq("user_id", user.id);
  await supabase
    .from("parts_inventory")
    .update({ display_order: neighbor.display_order })
    .eq("id", cur.id)
    .eq("user_id", user.id);

  revalidatePath("/dashboard/parts-inventory");
  return undefined;
}

// 入庫登録: stock_quantity を加算し、stock_movements に 'in' として記録。
// quantity は 0 より大きい正数のみ受け付ける。
export type StockInPayload = {
  part_id: string;
  quantity: number;
  unit_cost: number | null;
  memo: string | null;
};

export async function registerStockIn(
  payload: StockInPayload,
): Promise<{ error: string } | { success: true }> {
  if (!payload.part_id) return { error: "対象部品が指定されていません。" };
  if (!Number.isFinite(payload.quantity) || payload.quantity <= 0) {
    return { error: "入庫数は 0 より大きい数値で入力してください。" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  const { data: cur } = await supabase
    .from("parts_inventory")
    .select("stock_quantity")
    .eq("id", payload.part_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!cur) return { error: "対象部品が見つかりません。" };

  const nextQty = Number(cur.stock_quantity) + payload.quantity;

  const { error: updErr } = await supabase
    .from("parts_inventory")
    .update({ stock_quantity: nextQty })
    .eq("id", payload.part_id)
    .eq("user_id", user.id);
  if (updErr) return { error: `在庫更新に失敗しました: ${updErr.message}` };

  const { error: movErr } = await supabase.from("stock_movements").insert({
    user_id: user.id,
    part_id: payload.part_id,
    movement_type: "in" satisfies MovementType,
    quantity: payload.quantity,
    unit_cost: payload.unit_cost,
    memo: payload.memo,
  });
  if (movErr) {
    // 履歴記録に失敗した場合、在庫は加算済み。整合性は失われるが
    // 障害ログは Supabase 側に残るので運用で復旧する想定。
    return { error: `履歴記録に失敗しました: ${movErr.message}` };
  }

  revalidatePath("/dashboard/parts-inventory");
  return { success: true };
}

// 棚卸調整: stock_quantity を絶対値で上書きし、差分を 'adjust' で履歴記録。
// new_quantity は ≥0 を許容（0 = 在庫なしに修正、もあり得る）。
export type StockAdjustPayload = {
  part_id: string;
  new_quantity: number;
  memo: string | null;
};

export async function adjustStock(
  payload: StockAdjustPayload,
): Promise<{ error: string } | { success: true; delta: number }> {
  if (!payload.part_id) return { error: "対象部品が指定されていません。" };
  if (!Number.isFinite(payload.new_quantity) || payload.new_quantity < 0) {
    return { error: "実在庫数は 0 以上の数値で入力してください。" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  const { data: cur } = await supabase
    .from("parts_inventory")
    .select("stock_quantity")
    .eq("id", payload.part_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!cur) return { error: "対象部品が見つかりません。" };

  const delta = payload.new_quantity - Number(cur.stock_quantity);

  // 差分 0 のときは何もしないで成功扱い（履歴も増やさない）。
  if (delta === 0) return { success: true, delta: 0 };

  const { error: updErr } = await supabase
    .from("parts_inventory")
    .update({ stock_quantity: payload.new_quantity })
    .eq("id", payload.part_id)
    .eq("user_id", user.id);
  if (updErr) return { error: `在庫更新に失敗しました: ${updErr.message}` };

  const { error: movErr } = await supabase.from("stock_movements").insert({
    user_id: user.id,
    part_id: payload.part_id,
    movement_type: "adjust" satisfies MovementType,
    quantity: delta,
    memo: payload.memo,
  });
  if (movErr) {
    return { error: `履歴記録に失敗しました: ${movErr.message}` };
  }

  revalidatePath("/dashboard/parts-inventory");
  return { success: true, delta };
}

// form action 用の薄いラッパー（削除ボタンから hidden id を受けて呼ぶ）。
export async function softDeletePartFormAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await softDeletePart(id);
}
