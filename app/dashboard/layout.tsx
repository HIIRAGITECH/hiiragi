import Link from "next/link";
import { isAdmin } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

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

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-zinc-950">
      <header className="no-print border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <Link
              href="/dashboard"
              className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
            >
              HIIRAGI
            </Link>
            <nav className="flex items-center gap-4 text-sm text-zinc-600 dark:text-zinc-400">
              <Link
                href="/dashboard"
                className="hover:text-zinc-900 dark:hover:text-zinc-50"
              >
                ダッシュボード
              </Link>
              <Link
                href="/dashboard/customers"
                className="hover:text-zinc-900 dark:hover:text-zinc-50"
              >
                顧客管理
              </Link>
              <Link
                href="/dashboard/orders"
                className="hover:text-zinc-900 dark:hover:text-zinc-50"
              >
                受注管理
              </Link>
              <Link
                href="/dashboard/work-menus"
                className="hover:text-zinc-900 dark:hover:text-zinc-50"
              >
                作業メニュー
              </Link>
              <Link
                href="/dashboard/work-menu-sets"
                className="hover:text-zinc-900 dark:hover:text-zinc-50"
              >
                作業セット
              </Link>
              <Link
                href="/dashboard/sales"
                className="hover:text-zinc-900 dark:hover:text-zinc-50"
              >
                売上集計
              </Link>
              <Link
                href="/dashboard/settings"
                className="hover:text-zinc-900 dark:hover:text-zinc-50"
              >
                設定
              </Link>
              {admin && (
                <Link
                  href="/dashboard/admin"
                  className="text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200"
                >
                  管理者
                </Link>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-zinc-500 sm:inline dark:text-zinc-400">
              {user?.email}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                ログアウト
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        {children}
      </main>
    </div>
  );
}
