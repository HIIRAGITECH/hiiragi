import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ShopInfo, Subscription } from "@/lib/types";
import EditForm from "./edit-form";

export const metadata: Metadata = {
  title: "ユーザ詳細 | HIIRAGI",
};

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createAdminClient();

  const userResult = await admin.auth.admin.getUserById(id);
  if (userResult.error || !userResult.data.user) {
    notFound();
  }
  const user = userResult.data.user;
  const meta = (user.user_metadata ?? {}) as Partial<ShopInfo>;

  // 既存サブスクを取得。trigger で自動作成されているはずだが、
  // 念のため取得できなかった場合はフォームに初期値だけ流し込む。
  const subResult = await admin
    .from("subscriptions")
    .select("*")
    .eq("user_id", id)
    .maybeSingle();

  const sub = (subResult.data ?? null) as Subscription | null;

  return (
    <>
      <div className="wos-pagehead">
        <div className="min-w-0 flex-1">
          <div className="wos-crumbs">
            <Link
              href="/admin"
              className="text-[var(--color-ink-light)] underline-offset-2 hover:underline"
            >
              管理者 ／ ユーザ管理
            </Link>{" "}
            ／ 詳細
          </div>
          <h1>{meta.shop_name?.trim() || "（店舗名未設定）"}</h1>
          <div className="wos-gloss">{user.email}</div>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[var(--color-cream)]">
        <div className="px-8 py-6 max-w-3xl space-y-6">
          <section className="wos-card space-y-3">
            <div className="wos-sec-label">基本情報</div>
            <dl className="grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
              <dt className="text-[var(--color-ink-mid)]">ユーザID</dt>
              <dd className="font-mono text-xs">{user.id}</dd>
              <dt className="text-[var(--color-ink-mid)]">メール</dt>
              <dd>{user.email ?? "—"}</dd>
              <dt className="text-[var(--color-ink-mid)]">店舗名</dt>
              <dd>{meta.shop_name?.trim() || "（未設定）"}</dd>
              <dt className="text-[var(--color-ink-mid)]">登録日</dt>
              <dd>{user.created_at?.slice(0, 10).replace(/-/g, "/") ?? "—"}</dd>
              <dt className="text-[var(--color-ink-mid)]">最終ログイン</dt>
              <dd>
                {user.last_sign_in_at
                  ? new Date(user.last_sign_in_at)
                      .toLocaleString("ja-JP", { hour12: false })
                  : "—"}
              </dd>
            </dl>
          </section>

          <EditForm userId={user.id} email={user.email ?? ""} subscription={sub} />
        </div>
      </div>
    </>
  );
}
