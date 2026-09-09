// 部品画像まわりの共有定数。**クライアント・サーバー両方から import される**ので、
// ここには server 専用のもの（supabase server client 等）を置かないこと。
// 署名付きURLの発行は lib/parts/images-server.ts 側。

// 非公開バケット。公開URLは発行しない（EC公開時は「公開用の別経路」を足す前提）。
export const PART_IMAGES_BUCKET = "part-images";

// 1部品あたりの上限。DB 側でもトリガ + CHECK で担保している
// （supabase/migrations/20260909000000_create_parts_inventory_images.sql）。
// ここを変えるときは必ず DB 側の 5 も一緒に変えること。
export const MAX_PART_IMAGES = 5;

// アップロード受付MIME。バケットの allowed_mime_types と揃える。
export const PART_IMAGE_ACCEPT = "image/png,image/jpeg,image/webp";

// クライアント側リサイズの目標。原寸のまま上げない（通信量・Storage容量・表示速度のため）。
// 長辺 1600px あれば一覧サムネイルにも詳細の拡大にも十分。
export const PART_IMAGE_MAX_EDGE = 1600;
export const PART_IMAGE_QUALITY = 0.82;

// 署名付きURLの既定有効期間（秒）。ページ表示中に切れない程度の短さ。
export const PART_IMAGE_SIGNED_URL_TTL = 3600;

// Storage 上のパス形式: `<user_id>/<part_id>/<uuid>.<ext>`
// 先頭フォルダを user_id にすることで、shop-assets と同じ
// `(storage.foldername(name))[1] = auth.uid()` のポリシーがそのまま効く。
export function buildPartImagePath(
  userId: string,
  partId: string,
  fileName: string,
): string {
  return `${userId}/${partId}/${fileName}`;
}

// サーバー側の受け入れ検証用。クライアントから渡されたパスが
// 「このユーザーの、この部品の」正規の形かを見る（他人のフォルダを指す値を弾く）。
export function isValidPartImagePath(
  path: string,
  userId: string,
  partId: string,
): boolean {
  const re = new RegExp(
    `^${escapeRe(userId)}/${escapeRe(partId)}/[A-Za-z0-9_-]+\\.(jpg|jpeg|png|webp)$`,
  );
  return re.test(path);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
