import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { PartImage, PartImageWithUrl } from "@/lib/types";
import { PART_IMAGES_BUCKET, PART_IMAGE_SIGNED_URL_TTL } from "./images";

// 部品画像の表示用URLを作る唯一の入口。
//
// バケットは非公開なので、表示には署名付きURLが要る。ここを1か所に集約しておくことで、
// 将来ECサイト側から同じ画像を出すときも「この関数の実装を差し替える／EC用の別実装を足す」
// だけで済み、**原価などの社内情報を載せた経路を画像のために公開してしまう**のを避けられる。
// （DB が持つのは storage_path だけ・URLは保存しない、という前提もそのため。）
//
// ここではログイン中ユーザーのクライアント（RLS 有効）で署名する＝自分の画像しか署名できない。
// EC の非ログイン公開が必要になったら、service role で署名する専用ルートか、
// 公開用ミラーバケットを別に用意する（この関数は触らない）。
export async function signPartImagePaths(
  paths: string[],
  expiresInSec: number = PART_IMAGE_SIGNED_URL_TTL,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return map;

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(PART_IMAGES_BUCKET)
    .createSignedUrls(unique, expiresInSec);

  if (error) {
    console.error("[part-images] createSignedUrls failed:", error);
    return map;
  }
  for (const row of data ?? []) {
    // path は要求した順に返るが、念のため row.path で引き当てる。
    if (row.path && row.signedUrl) map.set(row.path, row.signedUrl);
  }
  return map;
}

// 画像行に署名付きURLを添えて返す（並びは display_order を尊重した入力順のまま）。
export async function attachSignedUrls(
  images: PartImage[],
): Promise<PartImageWithUrl[]> {
  const urls = await signPartImagePaths(images.map((i) => i.storage_path));
  return images.map((i) => ({ ...i, url: urls.get(i.storage_path) ?? null }));
}

// 指定部品の画像を display_order 順で取得し、署名付きURLを添えて返す（編集画面用）。
export async function loadPartImages(
  userId: string,
  partId: string,
): Promise<PartImageWithUrl[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parts_inventory_images")
    .select("*")
    .eq("user_id", userId)
    .eq("part_id", partId)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[part-images] loadPartImages failed:", error);
    return [];
  }
  return attachSignedUrls((data ?? []) as PartImage[]);
}

// 一覧用: テナントの全部品について「代表画像(display_order 最小)」の署名付きURLを part_id ごとに返す。
// 画像が無い部品はキー自体が存在しない（呼び出し側でプレースホルダー表示にする）。
export async function loadPrimaryImageUrls(
  userId: string,
): Promise<Record<string, string>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parts_inventory_images")
    .select("part_id, storage_path, display_order, created_at")
    .eq("user_id", userId)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[part-images] loadPrimaryImageUrls failed:", error);
    return {};
  }

  // display_order 昇順で来るので、各 part の最初に出会った1件が代表画像。
  const primaryPathByPart: Record<string, string> = {};
  for (const row of data ?? []) {
    const pid = row.part_id as string;
    if (primaryPathByPart[pid] === undefined) {
      primaryPathByPart[pid] = row.storage_path as string;
    }
  }

  const urls = await signPartImagePaths(Object.values(primaryPathByPart));

  const out: Record<string, string> = {};
  for (const [pid, path] of Object.entries(primaryPathByPart)) {
    const url = urls.get(path);
    if (url) out[pid] = url;
  }
  return out;
}
