import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/format";
import type { ShopInfo } from "@/lib/types";

export const metadata: Metadata = {
  title: "管理者画面 | HIIRAGI",
};

type AdminUserRow = {
  id: string;
  email: string;
  shop_name: string;
  registered_at: string; // YYYY-MM-DD
};

export default async function AdminPage() {
  // 管理者以外はダッシュボードへ
  if (!(await isAdmin())) {
    redirect("/dashboard");
  }

  let users: AdminUserRow[] = [];
  let errorMessage: string | null = null;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (error) {
      errorMessage = error.message;
    } else {
      users = data.users.map((u) => {
        const meta = (u.user_metadata ?? {}) as Partial<ShopInfo>;
        return {
          id: u.id,
          email: u.email ?? "—",
          shop_name: meta.shop_name?.trim() || "（未設定）",
          registered_at: u.created_at?.slice(0, 10) ?? "",
        };
      });
    }
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : String(e);
  }

  return (
    <>
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          管理者画面
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          登録ユーザ数: {users.length} 件
        </p>
      </div>

      {errorMessage && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          ユーザ一覧の取得に失敗しました: {errorMessage}
        </p>
      )}

      <div className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        {users.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
            ユーザがいません。
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wider text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-medium">メールアドレス</th>
                <th className="px-4 py-3 font-medium">店舗名</th>
                <th className="px-4 py-3 font-medium">登録日</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {users.map((u) => (
                <tr
                  key={u.id}
                  className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                >
                  <td className="px-4 py-3 text-zinc-900 dark:text-zinc-50">
                    {u.email}
                  </td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                    {u.shop_name}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {u.registered_at ? formatDate(u.registered_at) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
