import { NextResponse, type NextRequest } from "next/server";
import { GoogleNotConnectedError, ensureRootFolder } from "@/lib/google/drive";
import { OAUTH_RETURN_PATH } from "@/lib/google/oauth";
import { createClient } from "@/lib/supabase/server";

// Googleドライブ連携 段階3: 親フォルダ「HIIRAGI受注写真」を確保する手動トリガ (動作確認用)。
// 正式UI・連携直後の自動作成は段階4で検討。googleapis は Node ランタイム必須。
export const runtime = "nodejs";

function back(
  origin: string,
  params: Record<string, string>,
): NextResponse {
  const url = new URL(`${origin}${OAUTH_RETURN_PATH}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return back(origin, { drive: "error", reason: "unauthorized" });
  }

  try {
    const folderId = await ensureRootFolder(user.id);
    return back(origin, { drive: "ok", folder_id: folderId });
  } catch (e) {
    // 段階2のデバッグで有効だったため、握りつぶさず生エラーをログに出す。
    console.error("[google-drive] ensureRootFolder failed", e);
    if (e instanceof GoogleNotConnectedError) {
      return back(origin, { drive: "error", reason: "not_connected" });
    }
    return back(origin, { drive: "error", reason: "ensure_failed" });
  }
}
