"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// 既存 actions.ts と同じ流儀。useActionState で扱う薄い結果型。
// 成功時はクライアントが Effect で検知して画面側を片付ける。
export type VariantFormState =
  | { error: string }
  | { success: true }
  | undefined;

function pickString(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}

// 空欄 = null、不正値も null（負数は許容しない）。actions.ts の同名ヘルパー流儀に揃える。
function pickNullableNumber(formData: FormData, key: string): number | null {
  const s = pickString(formData, key);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// vehicle_tags はクライアントから JSON.stringify(string[]) で送る方式。
//   - JSON 方式を採用した理由: 品番にカンマやスペースが入っても安全。
//     クライアント側で trim/重複除外を済ませている前提だが、サーバー側でも防御的に再正規化する。
function pickStringArray(formData: FormData, key: string): string[] {
  const v = formData.get(key);
  if (typeof v !== "string" || v.trim() === "") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(v);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of parsed) {
    if (typeof x !== "string") continue;
    const t = x.trim();
    if (t === "" || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

type VariantPayload = {
  part_number: string | null;
  list_price: number | null;
  vehicle_tags: string[];
  // 業販掛け率（小数）。null = 未設定。クライアントが「%入力 → /100 して小数化」してから
  // 名前 markup_rate で送信する。pickNullableNumber が空・不正・負値を null に正規化する。
  markup_rate: number | null;
};

function readVariantPayload(formData: FormData): VariantPayload {
  return {
    part_number: pickString(formData, "part_number"),
    list_price: pickNullableNumber(formData, "list_price"),
    vehicle_tags: pickStringArray(formData, "vehicle_tags"),
    markup_rate: pickNullableNumber(formData, "markup_rate"),
  };
}

// 新規追加。partId は呼び出し側で .bind(null, partId) で固定する。
// display_order は当該部品配下の既存最大 + 1（並びは末尾追加）。
export async function createVariant(
  partId: string,
  _prev: VariantFormState,
  formData: FormData,
): Promise<VariantFormState> {
  if (!partId) return { error: "親部品が指定されていません。" };

  const payload = readVariantPayload(formData);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  // 親部品の所有確認（user_id 一致）。RLS への二重防御 + 不正 partId のガード。
  const { data: parent } = await supabase
    .from("parts_inventory")
    .select("id")
    .eq("id", partId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!parent) return { error: "親部品が見つかりません。" };

  const { data: maxRow } = await supabase
    .from("parts_inventory_variants")
    .select("display_order")
    .eq("part_id", partId)
    .eq("user_id", user.id)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder =
    typeof maxRow?.display_order === "number" ? maxRow.display_order + 1 : 0;

  const { error } = await supabase.from("parts_inventory_variants").insert({
    user_id: user.id,
    part_id: partId,
    part_number: payload.part_number,
    list_price: payload.list_price,
    vehicle_tags: payload.vehicle_tags,
    markup_rate: payload.markup_rate,
    display_order: nextOrder,
  });
  if (error) return { error: `追加に失敗しました: ${error.message}` };

  revalidatePath(`/dashboard/parts-inventory/${partId}/edit`);
  return { success: true };
}

// 更新。variant 自身の id をバインドして呼ぶ。
export async function updateVariant(
  id: string,
  _prev: VariantFormState,
  formData: FormData,
): Promise<VariantFormState> {
  if (!id) return { error: "ID が不正です。" };

  const payload = readVariantPayload(formData);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  // 親 part_id を取得してから update（revalidatePath 用）。同時に所有確認も兼ねる。
  const { data: cur } = await supabase
    .from("parts_inventory_variants")
    .select("part_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!cur) return { error: "対象の組が見つかりません。" };

  const { error } = await supabase
    .from("parts_inventory_variants")
    .update({
      part_number: payload.part_number,
      list_price: payload.list_price,
      vehicle_tags: payload.vehicle_tags,
      markup_rate: payload.markup_rate,
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: `更新に失敗しました: ${error.message}` };

  revalidatePath(`/dashboard/parts-inventory/${cur.part_id}/edit`);
  return { success: true };
}

// ソフトデリート（物理削除しない・既存 parts_inventory と同流儀）。
export async function softDeleteVariant(
  id: string,
): Promise<{ error: string } | { success: true }> {
  if (!id) return { error: "ID が不正です。" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  const { data: cur } = await supabase
    .from("parts_inventory_variants")
    .select("part_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!cur) return { error: "対象の組が見つかりません。" };

  const { error } = await supabase
    .from("parts_inventory_variants")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: `削除に失敗しました: ${error.message}` };

  revalidatePath(`/dashboard/parts-inventory/${cur.part_id}/edit`);
  return { success: true };
}
