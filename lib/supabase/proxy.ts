import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { evaluateAccess } from "@/lib/subscription";
import type { Subscription } from "@/lib/types";

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

  // ── 課金アクセス制御（完全ロック型）─────────────────────────
  // 有効でない契約（トライアル切れ・status=suspended）はダッシュボードを見せず /locked へ。
  // 例外: /dashboard/billing（課金しないと解除できない）と /locked は通す。
  // 管理者（ADMIN_EMAIL）は常にバイパス。判定対象は /dashboard 配下と /locked のみ。
  if (user) {
    const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const isAdminUser =
      !!adminEmail && user.email?.toLowerCase() === adminEmail;

    const isLockedRoute = path === "/locked";
    const isDashboard = path.startsWith("/dashboard");
    const isBilling =
      path === "/dashboard/billing" || path.startsWith("/dashboard/billing/");

    // ゲート判定が要るのは /dashboard 配下か /locked のときだけ（それ以外はDB読みを省く）。
    if (!isAdminUser && (isDashboard || isLockedRoute)) {
      // subscriptions は RLS でオーナー限定。middleware の SSR クライアント
      // （ユーザー Cookie 付き）で自テナント1行を読む。
      const { data } = await supabase
        .from("subscriptions")
        .select("plan, status, trial_ends_at")
        .eq("user_id", user.id)
        .maybeSingle();

      const { locked } = evaluateAccess(
        data as Pick<
          Subscription,
          "plan" | "status" | "trial_ends_at"
        > | null,
        Date.now(),
      );

      if (locked) {
        // ロック中: billing と locked 以外は /locked へ。
        if (!isBilling && !isLockedRoute) {
          const url = request.nextUrl.clone();
          url.pathname = "/locked";
          return NextResponse.redirect(url);
        }
      } else if (isLockedRoute) {
        // 非ロックなのに /locked に来た場合はダッシュボードへ戻す（ループ防止）。
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard";
        return NextResponse.redirect(url);
      }
    }
  }

  return response;
}
