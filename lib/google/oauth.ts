import "server-only";

import { google } from "googleapis";

// Googleドライブ連携の OAuth2 まわりの共有ヘルパー (段階2)。
// start / callback の両 route が同じ client 設定・scope・state cookie 名を使うため集約する。

// drive.file = アプリが作成・開いたファイルのみアクセス (最小権限・DECISIONS 段階0 参照)。
// openid + userinfo.email = 連携先メールを表示用に1つ取得するためだけに付与。
export const GOOGLE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
];

// CSRF 用 state を一時保管する httpOnly cookie 名。
export const OAUTH_STATE_COOKIE = "g_oauth_state";

// 連携後に戻る先 (段階4で settings に正式 UI を置く)。
export const OAUTH_RETURN_PATH = "/dashboard/settings";

// env が欠けていれば起動時ではなく呼び出し時に明示エラーにする。
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`${name} が設定されていません (.env.local を確認)。`);
  }
  return v;
}

// 都度生成する OAuth2 client。redirect_uri は GOOGLE_REDIRECT_URI と完全一致させる
// (Google は完全一致照合。dev=localhost / prod=app ドメインを env で切替)。
export function createOAuthClient() {
  return new google.auth.OAuth2(
    requireEnv("GOOGLE_CLIENT_ID"),
    requireEnv("GOOGLE_CLIENT_SECRET"),
    requireEnv("GOOGLE_REDIRECT_URI"),
  );
}

// id_token (JWT) の payload から email を取り出す。Google のトークンエンドポイントから
// TLS 経由で直接受け取った値なので署名検証は省略 (表示用途・追加 API 呼び出しを避ける)。
export function emailFromIdToken(idToken?: string | null): string | null {
  if (!idToken) return null;
  const parts = idToken.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    );
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}
