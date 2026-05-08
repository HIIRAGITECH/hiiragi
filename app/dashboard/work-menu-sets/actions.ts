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

// menu_item_ids_json: ["uuid1","uuid2",...] の position 順序付き配列
function parseMenuItemIds(json: string | null): string[] | null {
  if (!json) return [];
  try {
    const raw = JSON.parse(json);
    if (!Array.isArray(raw)) return null;
    const ids: string[] = [];
    for (const v of raw) {
      if (typeof v !== "string" || v === "") return null;
      ids.push(v);
    }
    return ids;
  } catch {
    return null;
  }
}

type SetPayload = {
  name: string;
  memo: string | null;
  menu_item_ids: string[];
};

function readPayload(formData: FormData): SetPayload | { error: string } {
  const name = pickString(formData, "name");
  if (!name) return { error: "セット名は必須です。" };

  const ids = parseMenuItemIds(
    typeof formData.get("menu_item_ids_json") === "string"
      ? (formData.get("menu_item_ids_json") as string)
      : null,
  );
  if (ids === null) return { error: "メニューの選択が不正です。" };
  if (ids.length === 0) {
    return { error: "セットには 1 つ以上の作業メニューを追加してください。" };
  }

  return {
    name,
    memo: pickString(formData, "memo"),
    menu_item_ids: ids,
  };
}

// 指定したメニュー ID 群が現ユーザーのものか確認する
async function ensureOwnedMenus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  ids: string[],
): Promise<{ error: string } | undefined> {
  const uniq = Array.from(new Set(ids));
  const { data, error } = await supabase
    .from("work_menu_items")
    .select("id")
    .eq("user_id", userId)
    .in("id", uniq);
  if (error) return { error: `メニュー存在確認に失敗しました: ${error.message}` };
  const found = new Set((data ?? []).map((r) => r.id));
  for (const id of uniq) {
    if (!found.has(id)) return { error: "存在しないメニューが含まれています。" };
  }
  return undefined;
}

export async function createWorkMenuSet(
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

  const guard = await ensureOwnedMenus(supabase, user.id, result.menu_item_ids);
  if (guard) return guard;

  const { data: maxRow } = await supabase
    .from("work_menu_sets")
    .select("display_order")
    .eq("user_id", user.id)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder =
    typeof maxRow?.display_order === "number" ? maxRow.display_order + 1 : 0;

  const { data: inserted, error: setErr } = await supabase
    .from("work_menu_sets")
    .insert({
      name: result.name,
      memo: result.memo,
      display_order: nextOrder,
      user_id: user.id,
    })
    .select("id")
    .single();
  if (setErr || !inserted) {
    return { error: `登録に失敗しました: ${setErr?.message ?? "unknown"}` };
  }

  const links = result.menu_item_ids.map((mid, i) => ({
    set_id: inserted.id,
    menu_item_id: mid,
    position: i,
  }));
  if (links.length > 0) {
    const { error: linkErr } = await supabase
      .from("work_menu_set_items")
      .insert(links);
    if (linkErr) {
      // ロールバックは無いので setをそのままにすると不整合になる。set ごと消す。
      await supabase
        .from("work_menu_sets")
        .delete()
        .eq("id", inserted.id)
        .eq("user_id", user.id);
      return { error: `登録に失敗しました: ${linkErr.message}` };
    }
  }

  revalidatePath("/dashboard/work-menu-sets");
  redirect("/dashboard/work-menu-sets");
}

export async function updateWorkMenuSet(
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

  const guard = await ensureOwnedMenus(supabase, user.id, result.menu_item_ids);
  if (guard) return guard;

  const { error: setErr } = await supabase
    .from("work_menu_sets")
    .update({ name: result.name, memo: result.memo })
    .eq("id", id)
    .eq("user_id", user.id);
  if (setErr) return { error: `更新に失敗しました: ${setErr.message}` };

  // 中身は「全削除 → 再挿入」で差分計算を簡素化（RLS で他人のものは触れない）
  await supabase.from("work_menu_set_items").delete().eq("set_id", id);
  const links = result.menu_item_ids.map((mid, i) => ({
    set_id: id,
    menu_item_id: mid,
    position: i,
  }));
  if (links.length > 0) {
    const { error: linkErr } = await supabase
      .from("work_menu_set_items")
      .insert(links);
    if (linkErr) return { error: `更新に失敗しました: ${linkErr.message}` };
  }

  revalidatePath("/dashboard/work-menu-sets");
  redirect("/dashboard/work-menu-sets");
}

// 作業セット削除はソフト削除のみ。セットは過去明細から参照されない（明細はメニュー本体を
// source_menu_id で参照するため）ので、業務上は復元前提で安全側に倒す。
// 中身の work_menu_set_items はそのまま残し、復元時に直前の構成へ復帰できるようにする。
export async function deleteWorkMenuSet(
  id: string,
): Promise<{ error: string } | { success: true }> {
  if (!id) return { error: "ID が不正です。" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  const { error } = await supabase
    .from("work_menu_sets")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: `非表示化に失敗しました: ${error.message}` };
  revalidatePath("/dashboard/work-menu-sets");
  return { success: true };
}

// 非表示セットを復元する。
export async function restoreWorkMenuSet(
  id: string,
): Promise<{ error: string } | { success: true }> {
  if (!id) return { error: "ID が不正です。" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  const { error } = await supabase
    .from("work_menu_sets")
    .update({ deleted_at: null })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: `復元に失敗しました: ${error.message}` };
  revalidatePath("/dashboard/work-menu-sets");
  return { success: true };
}

export async function duplicateWorkMenuSet(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: src } = await supabase
    .from("work_menu_sets")
    .select("name, memo")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!src) return;

  const { data: items } = await supabase
    .from("work_menu_set_items")
    .select("menu_item_id, position")
    .eq("set_id", id)
    .order("position", { ascending: true });

  const { data: maxRow } = await supabase
    .from("work_menu_sets")
    .select("display_order")
    .eq("user_id", user.id)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder =
    typeof maxRow?.display_order === "number" ? maxRow.display_order + 1 : 0;

  const { data: inserted } = await supabase
    .from("work_menu_sets")
    .insert({
      name: `${src.name}（コピー）`,
      memo: src.memo,
      display_order: nextOrder,
      user_id: user.id,
    })
    .select("id")
    .single();

  if (inserted?.id && items && items.length > 0) {
    await supabase.from("work_menu_set_items").insert(
      items.map((it, i) => ({
        set_id: inserted.id,
        menu_item_id: it.menu_item_id,
        position: i,
      })),
    );
  }

  revalidatePath("/dashboard/work-menu-sets");
  if (inserted?.id) {
    redirect(`/dashboard/work-menu-sets/${inserted.id}/edit`);
  }
}
