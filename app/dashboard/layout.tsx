import Link from "next/link";
import { isAdmin } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";
import { getAccessState } from "@/lib/subscription";
import { ensureSystemCategories } from "@/lib/work-item-categories/ensure";
import { signOut } from "./actions";
import Sidebar from "./sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const admin = await isAdmin();

  // 標準業務カテゴリの遅延 seed（再発防止の恒久対策）。
  // 新規ユーザー（マイグレーションのバックフィル対象外）でも、ダッシュボードに来た時点で
  // 標準カテゴリ3つを保証する。既存ユーザーは NOOP。エラーは内部で握りつぶすため
  // 画面遷移は止まらない。await して、以降の子ページがカテゴリを参照する前に揃える。
  if (user) {
    await ensureSystemCategories();
  }

  // サイドバーの件数バッジ用集計（参照のみ・既存テーブル）。
  // 失敗してもサイドバーは出すため、エラーは無視して 0 に倒す。
  const counts = await fetchSidebarCounts();

  // トライアル残り7日以内の警告（管理者以外・1〜7日）。ロックは middleware 側で処理。
  const access = await getAccessState();
  const showTrialWarning =
    !access.isAdmin &&
    access.trialDaysLeft !== null &&
    access.trialDaysLeft >= 1 &&
    access.trialDaysLeft <= 7;

  return (
    <div className="flex flex-1 min-h-screen bg-[var(--color-cream)]">
      <Sidebar
        userEmail={user?.email ?? null}
        isAdmin={admin}
        counts={counts}
        signOutAction={signOut}
      />
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {showTrialWarning ? (
          <div className="px-8 pt-4">
            <p className="wos-alert warn flex flex-wrap items-center gap-x-2">
              <span>
                無料トライアルはあと {access.trialDaysLeft} 日で終了します。
              </span>
              <Link
                href="/dashboard/billing"
                className="underline underline-offset-2 font-semibold"
              >
                プランに申し込む
              </Link>
            </p>
          </div>
        ) : null}
        {children}
      </main>
    </div>
  );
}

async function fetchSidebarCounts() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { orders: 0, payments: 0, partsAlert: 0 };

  const [ordersRes, paymentsRes, partsRes] = await Promise.all([
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_archived", false),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("invoice_status", "請求済"),
    supabase
      .from("parts_inventory")
      .select("stock_quantity, reorder_point")
      .eq("user_id", user.id)
      .is("deleted_at", null),
  ]);

  const partsAlert =
    partsRes.data?.filter(
      (p) => Number(p.stock_quantity) <= Number(p.reorder_point),
    ).length ?? 0;

  return {
    orders: ordersRes.count ?? 0,
    payments: paymentsRes.count ?? 0,
    partsAlert,
  };
}
