import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/dashboard/actions";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // ADMIN_EMAIL に設定したメアド以外は dashboard にリダイレクト。
  if (!(await isAdmin())) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-[var(--color-cream)]">
      <header className="flex items-center justify-between border-b border-[var(--color-line)] bg-[var(--color-ink)] px-6 py-3 text-[var(--color-on-ink-fg)]">
        <div className="flex items-center gap-4">
          <span className="wos-wm text-base">
            HIIRAGI <em>ADMIN</em>
          </span>
          <Link
            href="/dashboard"
            className="text-xs tracking-widest text-[var(--color-on-ink-soft)] underline-offset-2 hover:underline"
          >
            ← ダッシュボードへ戻る
          </Link>
        </div>
        <div className="flex items-center gap-4">
          {user?.email && (
            <span className="text-xs text-[var(--color-on-ink-soft)]">
              {user.email}
            </span>
          )}
          <form action={signOut}>
            <button
              type="submit"
              className="text-xs tracking-widest text-[var(--color-on-ink-soft)] underline-offset-2 hover:underline"
            >
              ログアウト
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}
