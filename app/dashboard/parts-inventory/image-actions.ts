"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  MAX_PART_IMAGES,
  PART_IMAGES_BUCKET,
  isValidPartImagePath,
} from "@/lib/parts/images";

// 部品画像（parts_inventory_images）の操作。
//
// 既存の actions.ts（本体・価格カード・在庫）とはファイルを分ける。画像は
// **「更新する」ボタンの一括保存には乗せず、操作した時点で即確定**する流儀にしているため
// （実体のアップロードが Storage への直接通信で、フォーム submit と足並みを揃えられない）。
// 在庫RPC（reserve/release/consume/unconsume/deduct 系）には一切触らない。

export type ImageActionResult = { error: string } | { success: true };

type Ctx = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
};

async function requireUser(): Promise<Ctx | { error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };
  return { supabase, userId: user.id };
}

// 対象部品がこのユーザーのものか確認する。他テナントの part_id を指す行を作らせない
// （DB 側のトリガでも閉じているが、アプリ側でも先に弾いて分かりやすいエラーにする）。
async function assertOwnsPart(
  ctx: Ctx,
  partId: string,
): Promise<{ error: string } | null> {
  const { data } = await ctx.supabase
    .from("parts_inventory")
    .select("id")
    .eq("id", partId)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  return data ? null : { error: "対象の部品が見つかりません。" };
}

// 残っている画像の display_order を 0..n-1 に振り直す。
// CHECK(display_order < 5) があるので、常にこの形に保つ（欠番を残さない）。
async function renumber(ctx: Ctx, partId: string): Promise<void> {
  const { data } = await ctx.supabase
    .from("parts_inventory_images")
    .select("id")
    .eq("part_id", partId)
    .eq("user_id", ctx.userId)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });

  const rows = data ?? [];
  for (let i = 0; i < rows.length; i++) {
    await ctx.supabase
      .from("parts_inventory_images")
      .update({ display_order: i })
      .eq("id", rows[i].id)
      .eq("user_id", ctx.userId);
  }
}

// アップロード済みオブジェクトを DB に登録する。
//
// 流れ: クライアントが Storage に直接アップロード → そのパスでこれを呼ぶ。
// 登録に失敗したら **アップロード済みの実体を消す**（Storage に迷子のオブジェクトを残さない）。
export async function registerPartImage(payload: {
  part_id: string;
  storage_path: string;
}): Promise<ImageActionResult> {
  const ctx = await requireUser();
  if ("error" in ctx) return ctx;

  const { part_id, storage_path } = payload;
  if (!part_id || !storage_path) {
    return { error: "登録内容が不正です。" };
  }

  // パスの形（<user_id>/<part_id>/<uuid>.<ext>）を検証。他人のフォルダや別部品を指す値を弾く。
  if (!isValidPartImagePath(storage_path, ctx.userId, part_id)) {
    await removeObjects(ctx, [storage_path]);
    return { error: "画像の保存先が不正です。画面を再読み込みしてください。" };
  }

  const owned = await assertOwnsPart(ctx, part_id);
  if (owned) {
    await removeObjects(ctx, [storage_path]);
    return owned;
  }

  // 枚数チェック（DB トリガでも担保しているが、ここで分かりやすいメッセージにする）。
  const { count } = await ctx.supabase
    .from("parts_inventory_images")
    .select("id", { count: "exact", head: true })
    .eq("part_id", part_id)
    .eq("user_id", ctx.userId);

  const current = count ?? 0;
  if (current >= MAX_PART_IMAGES) {
    await removeObjects(ctx, [storage_path]);
    return { error: `画像は1部品あたり ${MAX_PART_IMAGES} 枚までです。` };
  }

  const { error } = await ctx.supabase.from("parts_inventory_images").insert({
    user_id: ctx.userId,
    part_id,
    storage_path,
    display_order: current,
  });
  if (error) {
    await removeObjects(ctx, [storage_path]);
    return { error: `画像の登録に失敗しました: ${error.message}` };
  }

  revalidatePath("/dashboard/parts-inventory");
  revalidatePath(`/dashboard/parts-inventory/${part_id}/edit`);
  return { success: true };
}

// 個別削除: DB 行を消してから Storage の実体も消し、残りを 0..n-1 に詰め直す。
export async function deletePartImage(
  imageId: string,
): Promise<ImageActionResult> {
  const ctx = await requireUser();
  if ("error" in ctx) return ctx;
  if (!imageId) return { error: "ID が不正です。" };

  const { data: row } = await ctx.supabase
    .from("parts_inventory_images")
    .select("id, part_id, storage_path")
    .eq("id", imageId)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (!row) return { error: "対象の画像が見つかりません。" };

  const { error } = await ctx.supabase
    .from("parts_inventory_images")
    .delete()
    .eq("id", imageId)
    .eq("user_id", ctx.userId);
  if (error) return { error: `画像の削除に失敗しました: ${error.message}` };

  // 実体の削除に失敗しても DB 行は消えている（画面からは消える）。
  // 迷子のオブジェクトが残るだけなので、ここでは失敗を致命傷にしない。
  await removeObjects(ctx, [row.storage_path as string]);
  await renumber(ctx, row.part_id as string);

  revalidatePath("/dashboard/parts-inventory");
  revalidatePath(`/dashboard/parts-inventory/${row.part_id}/edit`);
  return { success: true };
}

// D&D 並べ替え: 渡された id 配列の順に display_order を 0..n-1 で振り直す。
// 先頭が代表画像（一覧のサムネイル）になる。
// 既存の reorderParts（部品本体）と同じ流儀。
export async function reorderPartImages(
  partId: string,
  orderedIds: string[],
): Promise<ImageActionResult> {
  const ctx = await requireUser();
  if ("error" in ctx) return ctx;
  if (!partId || !Array.isArray(orderedIds)) return { error: "並び順が不正です。" };
  if (orderedIds.length === 0) return { success: true };
  if (orderedIds.length > MAX_PART_IMAGES) {
    return { error: `画像は1部品あたり ${MAX_PART_IMAGES} 枚までです。` };
  }

  // 送られた id が本当にこの部品・このユーザーの画像かを確認してから書く。
  const { data: existing } = await ctx.supabase
    .from("parts_inventory_images")
    .select("id")
    .eq("part_id", partId)
    .eq("user_id", ctx.userId);
  const validIds = new Set((existing ?? []).map((r) => r.id as string));
  if (orderedIds.some((id) => !validIds.has(id))) {
    return { error: "画像の並び順が古くなっています。画面を再読み込みしてください。" };
  }

  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await ctx.supabase
      .from("parts_inventory_images")
      .update({ display_order: i })
      .eq("id", orderedIds[i])
      .eq("user_id", ctx.userId)
      .eq("part_id", partId);
    if (error) return { error: `並べ替えに失敗しました: ${error.message}` };
  }

  revalidatePath("/dashboard/parts-inventory");
  revalidatePath(`/dashboard/parts-inventory/${partId}/edit`);
  return { success: true };
}

async function removeObjects(ctx: Ctx, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await ctx.supabase.storage
    .from(PART_IMAGES_BUCKET)
    .remove(paths);
  if (error) {
    console.error("[part-images] storage remove failed:", error, paths);
  }
}
