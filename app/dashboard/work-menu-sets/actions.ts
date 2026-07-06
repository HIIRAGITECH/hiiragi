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

// part_items_json: [{part_id, quantity}, ...] の position 順序付き配列（案2で追加）。
// 部品は part_id ＋ quantity のみ保持。価格は受注展開時に解決する。
type SetPartInput = { part_id: string; quantity: number };
function parsePartItems(json: string | null): SetPartInput[] | null {
  if (!json) return [];
  try {
    const raw = JSON.parse(json);
    if (!Array.isArray(raw)) return null;
    const parts: SetPartInput[] = [];
    for (const v of raw) {
      if (!v || typeof v !== "object") return null;
      const pid = (v as { part_id?: unknown }).part_id;
      const qtyRaw = (v as { quantity?: unknown }).quantity;
      if (typeof pid !== "string" || pid === "") return null;
      const qty = Number(qtyRaw);
      if (!Number.isFinite(qty) || qty <= 0) return null;
      parts.push({ part_id: pid, quantity: qty });
    }
    return parts;
  } catch {
    return null;
  }
}

type SetPayload = {
  name: string;
  memo: string | null;
  menu_item_ids: string[];
  parts: SetPartInput[];
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

  const parts = parsePartItems(
    typeof formData.get("part_items_json") === "string"
      ? (formData.get("part_items_json") as string)
      : null,
  );
  if (parts === null) return { error: "部品の選択が不正です。" };

  // メニューのみ・部品のみ・両方いずれも可。最低 1 つは必要。
  if (ids.length === 0 && parts.length === 0) {
    return {
      error: "セットには作業メニューまたは部品を 1 つ以上追加してください。",
    };
  }

  return {
    name,
    memo: pickString(formData, "memo"),
    menu_item_ids: ids,
    parts,
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

// 指定した部品 ID 群が現ユーザーのものか確認する（メニューと同じ方式）。
async function ensureOwnedParts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  ids: string[],
): Promise<{ error: string } | undefined> {
  if (ids.length === 0) return undefined;
  const uniq = Array.from(new Set(ids));
  const { data, error } = await supabase
    .from("parts_inventory")
    .select("id")
    .eq("user_id", userId)
    .in("id", uniq);
  if (error) return { error: `部品存在確認に失敗しました: ${error.message}` };
  const found = new Set((data ?? []).map((r) => r.id));
  for (const id of uniq) {
    if (!found.has(id)) return { error: "存在しない部品が含まれています。" };
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
  const partGuard = await ensureOwnedParts(
    supabase,
    user.id,
    result.parts.map((p) => p.part_id),
  );
  if (partGuard) return partGuard;

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

  const partLinks = result.parts.map((p, i) => ({
    set_id: inserted.id,
    part_id: p.part_id,
    quantity: p.quantity,
    position: i,
  }));
  if (partLinks.length > 0) {
    const { error: partErr } = await supabase
      .from("work_menu_set_parts")
      .insert(partLinks);
    if (partErr) {
      // 中間テーブル(メニュー/部品)ごと set を消して不整合を防ぐ（CASCADE で子も消える）。
      await supabase
        .from("work_menu_sets")
        .delete()
        .eq("id", inserted.id)
        .eq("user_id", user.id);
      return { error: `登録に失敗しました: ${partErr.message}` };
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
  const partGuard = await ensureOwnedParts(
    supabase,
    user.id,
    result.parts.map((p) => p.part_id),
  );
  if (partGuard) return partGuard;

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

  // 部品も同様に「全削除 → 再挿入」（メニューとは別テーブルなので独立）。
  await supabase.from("work_menu_set_parts").delete().eq("set_id", id);
  const partLinks = result.parts.map((p, i) => ({
    set_id: id,
    part_id: p.part_id,
    quantity: p.quantity,
    position: i,
  }));
  if (partLinks.length > 0) {
    const { error: partErr } = await supabase
      .from("work_menu_set_parts")
      .insert(partLinks);
    if (partErr) return { error: `更新に失敗しました: ${partErr.message}` };
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

  const { data: partItems } = await supabase
    .from("work_menu_set_parts")
    .select("part_id, quantity, position")
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

  if (inserted?.id && partItems && partItems.length > 0) {
    await supabase.from("work_menu_set_parts").insert(
      partItems.map((it, i) => ({
        set_id: inserted.id,
        part_id: it.part_id,
        quantity: it.quantity,
        position: i,
      })),
    );
  }

  revalidatePath("/dashboard/work-menu-sets");
  if (inserted?.id) {
    redirect(`/dashboard/work-menu-sets/${inserted.id}/edit`);
  }
}
