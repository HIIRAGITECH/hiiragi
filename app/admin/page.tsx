import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  SUBSCRIPTION_OPTION_KEYS,
  type Subscription,
  type SubscriptionOptions,
} from "@/lib/types";

export const metadata: Metadata = {
  title: "ユーザ管理 | HIIRAGI",
};

const PLAN_LABEL: Record<string, string> = {
  free: "Free",
  paid: "Paid",
  trial: "Trial",
  special_free: "Special",
};

const STATUS_LABEL: Record<string, string> = {
  active: "稼働",
  suspended: "停止",
};

const OPTION_LABEL: Record<string, string> = {
  mypage: "マイページ",
  line_notify: "LINE通知",
  hp_integration: "HP連携",
};

type AdminRow = {
  id: string;
  email: string;
  shop_name: string;
  plan: string;
  status: string;
  options: SubscriptionOptions;
  last_sign_in_at: string | null;
  memo: string | null;
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}/${m}/${day} ${hh}:${mm}`;
}

export default async function AdminUsersPage() {
  const admin = createAdminClient();

  let rows: AdminRow[] = [];
  let errorMessage: string | null = null;

  try {
    const [usersResult, subsResult] = await Promise.all([
      admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
      admin.from("subscriptions").select("*"),
    ]);

    if (usersResult.error) {
      errorMessage = usersResult.error.message;
    } else {
      const subsByUser = new Map<string, Subscription>();
      for (const s of (subsResult.data ?? []) as Subscription[]) {
        subsByUser.set(s.user_id, s);
      }

      rows = usersResult.data.users.map((u) => {
        const meta = (u.user_metadata ?? {}) as { shop_name?: string };
        const sub = subsByUser.get(u.id);
        return {
          id: u.id,
          email: u.email ?? "—",
          shop_name: meta.shop_name?.trim() || "（未設定）",
          plan: sub?.plan ?? "—",
          status: sub?.status ?? "—",
          options: sub?.options ?? {},
          last_sign_in_at: u.last_sign_in_at ?? null,
          memo: sub?.memo ?? null,
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
          <div className="wos-crumbs">管理者 ／ ユーザ管理</div>
          <h1>ユーザ管理</h1>
          <div className="wos-gloss">
            登録ユーザのプラン・契約状態・オプション機能をここで管理します。登録数 {rows.length} 件
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="px-8 pt-4">
          <p className="wos-alert warn">
            ユーザ一覧の取得に失敗しました: {errorMessage}
          </p>
        </div>
      )}

      <div className="flex-1 overflow-auto bg-[var(--color-cream)]">
        <div className="px-8 py-6">
          {rows.length === 0 && !errorMessage ? (
            <div className="wos-card text-center py-12 text-sm text-[var(--color-ink-light)]">
              ユーザがいません。
            </div>
          ) : (
            <table className="w-full border-collapse bg-[var(--color-paper)] border border-[var(--color-line)]">
              <thead>
                <tr className="border-b-2 border-[var(--color-line-strong)] bg-[var(--color-cream)]">
                  <th className="wos-th">店舗名</th>
                  <th className="wos-th">メール</th>
                  <th className="wos-th">プラン</th>
                  <th className="wos-th">ステータス</th>
                  <th className="wos-th">オプション</th>
                  <th className="wos-th">最終ログイン</th>
                  <th className="wos-th">メモ</th>
                  <th className="wos-th right">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={r.id}
                    className="border-b border-[var(--color-line)]"
                    style={{
                      background:
                        i % 2 === 1 ? "var(--color-cream)" : "transparent",
                    }}
                  >
                    <td className="wos-td">{r.shop_name}</td>
                    <td className="wos-td">{r.email}</td>
                    <td className="wos-td">{PLAN_LABEL[r.plan] ?? r.plan}</td>
                    <td className="wos-td">
                      <span
                        className="inline-block border px-2 py-0.5 text-xs"
                        style={{
                          borderColor:
                            r.status === "active"
                              ? "var(--color-go)"
                              : "var(--color-warn)",
                          color:
                            r.status === "active"
                              ? "var(--color-go)"
                              : "var(--color-warn)",
                        }}
                      >
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="wos-td">
                      <div className="flex flex-wrap gap-1">
                        {SUBSCRIPTION_OPTION_KEYS.filter(
                          (k) => r.options[k] === true,
                        ).map((k) => (
                          <span
                            key={k}
                            className="inline-block border border-[var(--color-line-strong)] px-1.5 py-0.5 text-[10px] tracking-widest text-[var(--color-ink-mid)]"
                          >
                            {OPTION_LABEL[k] ?? k}
                          </span>
                        ))}
                        {SUBSCRIPTION_OPTION_KEYS.every(
                          (k) => !r.options[k],
                        ) && (
                          <span className="text-xs text-[var(--color-ink-light)]">
                            —
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="wos-td num muted">
                      {formatDateTime(r.last_sign_in_at)}
                    </td>
                    <td className="wos-td muted">
                      {r.memo ? (
                        <span
                          className="block max-w-[16rem] truncate"
                          title={r.memo}
                        >
                          {r.memo}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="wos-td right">
                      <Link
                        href={`/admin/users/${r.id}`}
                        className="wos-btn-ghost wos-btn-xs"
                      >
                        編集
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
