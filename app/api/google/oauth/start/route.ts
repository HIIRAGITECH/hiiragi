import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
  GOOGLE_OAUTH_SCOPES,
  OAUTH_RETURN_PATH,
  OAUTH_STATE_COOKIE,
  createOAuthClient,
} from "@/lib/google/oauth";
import { createClient } from "@/lib/supabase/server";

// Googleドライブ連携の開始 route (段階2)。
// ログインユーザーを確認 → CSRF用 state を httpOnly cookie に保存 → 同意画面へ redirect。
// googleapis / OAuth2 client は Node ランタイム必須。
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url);

  // 未ログインは弾く (連携はログイン店舗単位)。
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/login?next=${OAUTH_RETURN_PATH}`);
  }

  // 推測しにくいランダム state。callback で cookie と照合して CSRF を防ぐ。
  const state = randomUUID();

  const oauth2Client = createOAuthClient();
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline", // refresh_token を得るために必須
    prompt: "consent", // 再連携時も確実に refresh_token を返させる
    scope: GOOGLE_OAUTH_SCOPES,
    state,
  });

  // redirect レスポンスに直接 Set-Cookie を載せる (route handler で確実に送るため)。
  const response = NextResponse.redirect(authUrl);
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // OAuth リダイレクト (Google からの遷移) で送られる必要があるため lax
    path: "/",
    maxAge: 60 * 10, // 10分。同意完了までの一時値
  });
  return response;
}
