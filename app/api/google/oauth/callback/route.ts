import { NextResponse, type NextRequest } from "next/server";
import { ensureRootFolder } from "@/lib/google/drive";
import {
  OAUTH_RETURN_PATH,
  OAUTH_STATE_COOKIE,
  createOAuthClient,
  emailFromIdToken,
} from "@/lib/google/oauth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Googleドライブ連携のコールバック route (段階2)。
// 同意画面から code & state を受け取り → state 照合 → token 交換 →
// google_integrations に upsert → /dashboard/settings へ結果付きで redirect。
export const runtime = "nodejs";

// 結果を settings に伝えるための redirect ヘルパー。
function back(origin: string, status: "success" | "error", reason?: string) {
  const url = new URL(`${origin}${OAUTH_RETURN_PATH}`);
  url.searchParams.set("google", status);
  if (reason) url.searchParams.set("reason", reason);
  const response = NextResponse.redirect(url);
  // 使い終わった state cookie は破棄。
  response.cookies.delete(OAUTH_STATE_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url);

  // Google が同意キャンセル等でエラーを返した場合。
  const oauthError = searchParams.get("error");
  if (oauthError) {
    return back(origin, "error", oauthError);
  }

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const cookieState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;

  // CSRF 対策: start で発行し cookie に保存した state と一致するか。
  if (!code || !state || !cookieState || state !== cookieState) {
    return back(origin, "error", "invalid_state");
  }

  // user_id はサーバーで確認したセッションの値だけを使う (state とは独立に検証)。
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return back(origin, "error", "unauthorized");
  }

  // code を token に交換。
  let tokens;
  try {
    const oauth2Client = createOAuthClient();
    ({ tokens } = await oauth2Client.getToken(code));
  } catch (e) {
    console.error("[google-oauth] token exchange failed", e);
    return back(origin, "error", "token_exchange_failed");
  }

  const refreshToken = tokens.refresh_token ?? null;
  const accessToken = tokens.access_token ?? null;
  const tokenExpiry = tokens.expiry_date
    ? new Date(tokens.expiry_date).toISOString()
    : null;
  const googleEmail = emailFromIdToken(tokens.id_token);

  // service_role で書く (RLS バイパス)。ただし user_id は必ずサーバー確認済みの user.id。
  const admin = createAdminClient();

  // refresh_token は「今回取得できた時だけ」更新する。
  // Google は再同意時しか refresh_token を返さないため、null で既存を上書きして消さない。
  const payload: Record<string, unknown> = {
    user_id: user.id,
    provider: "google",
    access_token: accessToken,
    token_expiry: tokenExpiry,
  };
  if (googleEmail) payload.google_email = googleEmail;
  if (refreshToken) payload.refresh_token = refreshToken;

  const { error } = await admin
    .from("google_integrations")
    .upsert(payload, { onConflict: "user_id" });
  if (error) {
    // 握りつぶす前に Supabase の生エラーを必ず出す (message / code / details / hint)。
    console.error("[google-oauth] upsert failed", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return back(origin, "error", "save_failed");
  }

  // 段階5-A: 連携できた瞬間に親フォルダ「HIIRAGI受注写真」も作る（自然な体験）。
  // best-effort: トークンは既に保存済みなので、親フォルダ作成が失敗しても連携自体は成功扱い。
  // 親フォルダは後で settings の「親フォルダを作成」や受注の「写真フォルダを作成」押下時にも
  // ensureRootFolder 経由で作られる（自己修復）。冪等なので再連携で二重作成もしない。
  try {
    await ensureRootFolder(user.id);
  } catch (e) {
    console.error("[google-oauth] ensureRootFolder after connect failed", e);
  }

  return back(origin, "success");
}
