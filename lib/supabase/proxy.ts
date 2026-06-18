import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  // 未認証でアクセス可能なルート
  const authEntryRoutes = ["/login", "/signup", "/reset-password"];
  const isAuthEntry = authEntryRoutes.includes(path);
  const isAuthCallback = path.startsWith("/auth/callback");
  const isPublicAsset =
    path.startsWith("/_next") || path.startsWith("/favicon");
  // お客様マイページ（段階3）はログイン不要の公開ページ。トークンを知っている＝閲覧権限。
  const isMypage = path.startsWith("/mypage");

  if (!user && !isAuthEntry && !isAuthCallback && !isPublicAsset && !isMypage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // ログイン済みでサインイン系画面に来た場合はダッシュボードへ
  // ※ /update-password と /auth/callback はログイン済みでも通す
  if (user && isAuthEntry) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}
