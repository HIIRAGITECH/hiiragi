"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// 部品カテゴリ 段階1 のサーバーアクション。
// 作業カテゴリ(work-item-categories)とは別物・完全独立。part_categories のみを触る。
//
// 階層の要（最大3階層）:
//   level は「親の level + 1」でサーバーが決める（クライアントの申告を信用しない）。
//   level<=3 をここで弾き、DB 側でも CHECK(level BETWEEN 1 AND 3) が二重に守る。

const PATH = "/dashboard/part-categories";

export type ActionResult = { error: string } | { success: true };

function pickName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t === "" ? null : t;
}

// 新規作成: parentId=null なら大分類(level=1)。親があれば level=親+1。
// sort_order は同じ親の末尾（max + 1）。
export async function createPartCategory(input: {
  parentId: string | null;
  name: string;
}): Promise<ActionResult> {
  const name = pickName(input.name);
  if (!name) return { error: "カテゴリ名は必須です。" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  let level = 1;
  const parentId = input.parentId ?? null;

  if (parentId) {
    const { data: parent } = await supabase
      .from("part_categories")
      .select("id, level")
      .eq("id", parentId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!parent) return { error: "親カテゴリが見つかりません。" };
    level = parent.level + 1;
    if (level > 3) {
      return { error: "小分類の下にはこれ以上作成できません（最大3階層）。" };
    }
  }

  // 同じ親の中での末尾に置く。
  let siblingsQuery = supabase
    .from("part_categories")
    .select("sort_order")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: false })
    .limit(1);
  siblingsQuery = parentId
    ? siblingsQuery.eq("parent_id", parentId)
    : siblingsQuery.is("parent_id", null);
  const { data: maxRow } = await siblingsQuery.maybeSingle();
  const nextOrder =
    typeof maxRow?.sort_order === "number" ? maxRow.sort_order + 1 : 0;

  const { error } = await supabase.from("part_categories").insert({
    user_id: user.id,
    parent_id: parentId,
    name,
    level,
    sort_order: nextOrder,
  });
  if (error) return { error: `登録に失敗しました: ${error.message}` };

  revalidatePath(PATH);
  return { success: true };
}

// 名称変更のみ。階層(level/parent_id)は変えない。
export async function renamePartCategory(
  id: string,
  name: string,
): Promise<ActionResult> {
  if (!id) return { error: "ID が不正です。" };
  const trimmed = pickName(name);
  if (!trimmed) return { error: "カテゴリ名は必須です。" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  const { error } = await supabase
    .from("part_categories")
    .update({ name: trimmed })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: `更新に失敗しました: ${error.message}` };

  revalidatePath(PATH);
  return { success: true };
}

// 削除: ハード削除。配下(中・小)は DB の ON DELETE CASCADE で一緒に消える。
export async function deletePartCategory(id: string): Promise<ActionResult> {
  if (!id) return { error: "ID が不正です。" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  const { error } = await supabase
    .from("part_categories")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: `削除に失敗しました: ${error.message}` };

  revalidatePath(PATH);
  return { success: true };
}

// 並べ替え: 同じ親の中で、隣の兄弟と sort_order を入れ替える。
export async function movePartCategory(
  id: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  const { data: cur } = await supabase
    .from("part_categories")
    .select("id, parent_id, sort_order")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!cur) return { error: "対象が見つかりません。" };

  const op = direction === "up" ? "lt" : "gt";
  let neighborQuery = supabase
    .from("part_categories")
    .select("id, sort_order")
    .eq("user_id", user.id)
    .filter("sort_order", op, cur.sort_order)
    .order("sort_order", { ascending: direction !== "up" })
    .limit(1);
  // 同じ親スコープの兄弟だけを対象にする（null 親と通常親で分岐）。
  neighborQuery =
    cur.parent_id === null
      ? neighborQuery.is("parent_id", null)
      : neighborQuery.eq("parent_id", cur.parent_id);
  const { data: neighbor } = await neighborQuery.maybeSingle();
  if (!neighbor) return { success: true }; // 端（動かせない）

  const TEMP = -999_999_999;
  await supabase
    .from("part_categories")
    .update({ sort_order: TEMP })
    .eq("id", cur.id)
    .eq("user_id", user.id);
  await supabase
    .from("part_categories")
    .update({ sort_order: cur.sort_order })
    .eq("id", neighbor.id)
    .eq("user_id", user.id);
  await supabase
    .from("part_categories")
    .update({ sort_order: neighbor.sort_order })
    .eq("id", cur.id)
    .eq("user_id", user.id);

  revalidatePath(PATH);
  return { success: true };
}
