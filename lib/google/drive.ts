import "server-only";

import { google, type Auth } from "googleapis";
import { createOAuthClient } from "@/lib/google/oauth";
import { createAdminClient } from "@/lib/supabase/admin";

// googleapis が内部で使う OAuth2Client 型に揃える (google-auth-library を直接 import すると
// 二重コピーで型が衝突するため、createOAuthClient の戻り型から導出する)。
type OAuthClient = ReturnType<typeof createOAuthClient>;

// Googleドライブ連携 段階3: Drive API を叩くための共有ヘルパー (server-only)。
// 受注ごとの子フォルダ・UI は段階4。ここでは親フォルダ確保まで。

// 連携時に作る親フォルダ名 (DECISIONS 段階0 参照)。
export const ROOT_FOLDER_NAME = "HIIRAGI受注写真";

// 未連携 / refresh_token 失効を呼び出し側で区別できるようにする。
export class GoogleNotConnectedError extends Error {
  constructor(message = "Googleドライブが連携されていません。") {
    super(message);
    this.name = "GoogleNotConnectedError";
  }
}

type AdminClient = ReturnType<typeof createAdminClient>;

// リフレッシュで得た新トークンを保存する。
// refresh_token は再同意時しか返らないため、来た時だけ更新し、null では上書きしない (段階2と同じ注意)。
async function persistRefreshedTokens(
  admin: AdminClient,
  userId: string,
  tokens: Auth.Credentials,
) {
  const update: Record<string, unknown> = {};
  if (tokens.access_token) update.access_token = tokens.access_token;
  if (tokens.expiry_date)
    update.token_expiry = new Date(tokens.expiry_date).toISOString();
  if (tokens.refresh_token) update.refresh_token = tokens.refresh_token;
  if (Object.keys(update).length === 0) return;

  const { error } = await admin
    .from("google_integrations")
    .update(update)
    .eq("user_id", userId);
  if (error) {
    console.error("[google-drive] failed to persist refreshed tokens", {
      message: error.message,
      code: error.code,
    });
  }
}

// 該当ユーザーの refresh_token を service_role で取り出し、自動リフレッシュ設定済みの
// OAuth2 client を返す。access_token 期限切れ時は API 呼び出し時に googleapis が
// refresh_token で自動更新し、"tokens" イベント経由で新トークンを保存する。
export async function getAuthorizedClient(
  userId: string,
): Promise<OAuthClient> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("google_integrations")
    .select("refresh_token, access_token, token_expiry")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("[google-drive] failed to load integration", {
      message: error.message,
      code: error.code,
    });
    throw new Error("Google連携情報の取得に失敗しました。");
  }
  if (!data || !data.refresh_token) {
    throw new GoogleNotConnectedError();
  }

  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials({
    refresh_token: data.refresh_token,
    access_token: data.access_token ?? undefined,
    expiry_date: data.token_expiry
      ? new Date(data.token_expiry).getTime()
      : undefined,
  });

  // API 呼び出しで自動リフレッシュされた際に新トークンを保存する (best-effort)。
  oauth2Client.on("tokens", (tokens) => {
    void persistRefreshedTokens(admin, userId, tokens);
  });

  return oauth2Client;
}

// 親フォルダを確保する (冪等)。既存 root_folder_id が Drive 上で実在すればそれを返し、
// 無い / 削除済みなら作成して保存する。作成したフォルダIDを返す。
export async function ensureRootFolder(userId: string): Promise<string> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("google_integrations")
    .select("root_folder_id")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    console.error("[google-drive] failed to load root_folder_id", {
      message: error.message,
      code: error.code,
    });
    throw new Error("Google連携情報の取得に失敗しました。");
  }

  const auth = await getAuthorizedClient(userId);
  const drive = google.drive({ version: "v3", auth });

  // 既存IDがあれば Drive 上で実在 (かつゴミ箱でない) か確認。OKならそれを返す (二重作成しない)。
  const existing = data?.root_folder_id ?? null;
  if (existing) {
    try {
      const res = await drive.files.get({
        fileId: existing,
        fields: "id, trashed",
      });
      if (res.data.id && !res.data.trashed) {
        return existing;
      }
      console.error("[google-drive] root folder is trashed, recreating", {
        folderId: existing,
      });
    } catch (e) {
      // 見つからない / アクセス不可 → 作り直しに倒す。
      console.error("[google-drive] root folder verify failed, recreating", e);
    }
  }

  // 作成。drive.file スコープなのでアプリが作るこのフォルダは以後アプリから触れる。
  const created = await drive.files.create({
    requestBody: {
      name: ROOT_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id",
  });
  const folderId = created.data.id;
  if (!folderId) {
    throw new Error("フォルダ作成のレスポンスにidがありません。");
  }

  const { error: upErr } = await admin
    .from("google_integrations")
    .update({ root_folder_id: folderId })
    .eq("user_id", userId);
  if (upErr) {
    console.error("[google-drive] failed to save root_folder_id", {
      message: upErr.message,
      code: upErr.code,
    });
    throw new Error("root_folder_id の保存に失敗しました。");
  }

  return folderId;
}
