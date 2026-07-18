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
  registered_at: string;
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
      <div className="wos-pagehead">
        <div className="min-w-0 flex-1">
          <div className="wos-crumbs">管理者</div>
          <h1>管理者画面</h1>
          <div className="wos-gloss">登録ユーザ数 {users.length} 件</div>
        </div>
      </div>

      {errorMessage && (
        <div className="px-4 sm:px-8 pt-4">
          <p className="wos-alert warn">
            ユーザ一覧の取得に失敗しました: {errorMessage}
          </p>
        </div>
      )}

      <div className="flex-1 overflow-auto bg-[var(--color-cream)]">
        <div className="px-4 sm:px-8 py-6">
          {users.length === 0 ? (
            <div className="wos-card text-center py-12 text-sm text-[var(--color-ink-light)]">
              ユーザがいません。
            </div>
          ) : (
            <table className="w-full border-collapse bg-[var(--color-paper)] border border-[var(--color-line)]">
              <thead>
                <tr className="border-b-2 border-[var(--color-line-strong)] bg-[var(--color-cream)]">
                  <th className="wos-th">メールアドレス</th>
                  <th className="wos-th">店舗名</th>
                  <th className="wos-th right">顧客件数</th>
                  <th className="wos-th right">受注件数</th>
                  <th className="wos-th">登録日</th>
                  <th className="wos-th right">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => {
                  const isSelf = currentUser?.id === u.id;
                  return (
                    <tr
                      key={u.id}
                      className="border-b border-[var(--color-line)]"
                      style={{
                        background:
                          i % 2 === 1 ? "var(--color-cream)" : "transparent",
                      }}
                    >
                      <td className="wos-td">
                        {u.email}
                        {isSelf && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 border border-[var(--color-accent)] text-[var(--color-accent)]">
                            自分
                          </span>
                        )}
                      </td>
                      <td className="wos-td">{u.shop_name}</td>
                      <td className="wos-td num right">{u.customer_count}</td>
                      <td className="wos-td num right">{u.order_count}</td>
                      <td className="wos-td num muted">
                        {u.registered_at ? formatDate(u.registered_at) : "—"}
                      </td>
                      <td className="wos-td right">
                        {isSelf ? (
                          <span className="text-xs text-[var(--color-ink-light)]">
                            —
                          </span>
                        ) : (
                          <DeleteButton
                            action={deleteUser}
                            hidden={{ id: u.id }}
                            confirmMessage={`ユーザ「${u.email}」を削除します。\nこのユーザの顧客 ${u.customer_count} 件・受注 ${u.order_count} 件もすべて削除されます。\n本当によろしいですか？`}
                            label="削除"
                            className="wos-btn-danger wos-btn-xs"
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
      </div>
    </>
  );
}
