import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import DeleteButton from "@/lib/components/delete-button";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import type { ShopInfo } from "@/lib/types";
import { deleteUser } from "./actions";

export const metadata: Metadata = {
  title: "管理者画面 | HIIRAGI",
};

type AdminUserRow = {
  id: string;
  email: string;
  shop_name: string;
  registered_at: string; // YYYY-MM-DD
  customer_count: number;
  order_count: number;
};

function countByUserId(rows: { user_id: string }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    m.set(r.user_id, (m.get(r.user_id) ?? 0) + 1);
  }
  return m;
}

export default async function AdminPage() {
  if (!(await isAdmin())) {
    redirect("/dashboard");
  }

  // 現在のadminユーザID（自分自身の削除ボタンを抑止するため）
  const supabase = await createClient();
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();

  let users: AdminUserRow[] = [];
  let errorMessage: string | null = null;

  try {
    const admin = createAdminClient();
    const [usersResult, customersResult, ordersResult] = await Promise.all([
      admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
      admin.from("customers").select("user_id"),
      admin.from("orders").select("user_id"),
    ]);

    if (usersResult.error) {
      errorMessage = usersResult.error.message;
    } else {
      const customerCounts = countByUserId(
        (customersResult.data ?? []) as { user_id: string }[],
      );
      const orderCounts = countByUserId(
        (ordersResult.data ?? []) as { user_id: string }[],
      );

      users = usersResult.data.users.map((u) => {
        const meta = (u.user_metadata ?? {}) as Partial<ShopInfo>;
        return {
          id: u.id,
          email: u.email ?? "—",
          shop_name: meta.shop_name?.trim() || "（未設定）",
          registered_at: u.created_at?.slice(0, 10) ?? "",
          customer_count: customerCounts.get(u.id) ?? 0,
          order_count: orderCounts.get(u.id) ?? 0,
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

      <div className="mt-6 overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
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
                <th className="px-4 py-3 text-right font-medium">顧客件数</th>
                <th className="px-4 py-3 text-right font-medium">受注件数</th>
                <th className="px-4 py-3 font-medium">登録日</th>
                <th className="px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {users.map((u) => {
                const isSelf = currentUser?.id === u.id;
                return (
                  <tr
                    key={u.id}
                    className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  >
                    <td className="px-4 py-3 text-zinc-900 dark:text-zinc-50">
                      {u.email}
                      {isSelf && (
                        <span className="ml-2 rounded-full bg-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                          自分
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {u.shop_name}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                      {u.customer_count}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                      {u.order_count}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {u.registered_at ? formatDate(u.registered_at) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isSelf ? (
                        <span className="text-xs text-zinc-400 dark:text-zinc-600">
                          —
                        </span>
                      ) : (
                        <DeleteButton
                          action={deleteUser}
                          hidden={{ id: u.id }}
                          confirmMessage={`ユーザ「${u.email}」を削除します。\nこのユーザの顧客 ${u.customer_count} 件・受注 ${u.order_count} 件もすべて削除されます。\n本当によろしいですか？`}
                          label="削除"
                          className="rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs text-red-700 transition-colors hover:bg-red-50 dark:border-red-900 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950/30"
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
