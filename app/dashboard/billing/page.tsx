import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { evaluateAccess } from "@/lib/subscription";
import type { Subscription } from "@/lib/types";
import BillingForm from "./billing-form";
import { openCustomerPortal } from "./actions";

export const metadata: Metadata = {
  title: "プラン管理 | HIIRAGI",
};

const PLAN_LABEL: Record<string, string> = {
  free: "Free（無料）",
  paid: "Paid（有料プラン）",
  trial: "Trial（試用期間）",
  special_free: "Special Free（特別無料）",
};

function formatDateJp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: subRow } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  const sub = (subRow as Subscription | null) ?? null;

  const isPaidActive = sub?.plan === "paid" && sub.status === "active";
  // 特別無料（無料協力者）プラン。課金なしで恒久有効のため、申し込みフォームは出さない。
  const isSpecialFree = sub?.plan === "special_free";
  const mypageOn = sub?.options?.mypage === true;

  // ステータス表示は middleware と同じ evaluateAccess で判定し、実態と一致させる
  //（trial は status=active のままでも期限切れなら「試用期間終了」と出す）。
  const access = evaluateAccess(sub, Date.now());
  const statusOk = !!sub && !access.locked;
  const statusLabel = !sub
    ? "—"
    : access.locked
      ? sub.plan === "trial"
        ? "試用期間終了"
        : "停止中"
      : sub.plan === "trial"
        ? "試用期間中"
        : "稼働中";
  // 試用期限は trial のときだけ表示。過去日なら「（終了）」を添える。
  const trialExpired =
    sub?.plan === "trial" &&
    sub.trial_ends_at != null &&
    new Date(sub.trial_ends_at).getTime() <= Date.now();

  return (
    <>
      <div className="wos-pagehead">
        <div className="min-w-0 flex-1">
          <div className="wos-crumbs">システム ／ プラン管理</div>
          <h1>プラン管理</h1>
          <div className="wos-gloss">
            HIIRAGI のサブスクリプションプランをここから管理します。決済は Stripe を使用します。
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[var(--color-cream)]">
        <div className="px-4 sm:px-8 py-6 max-w-3xl space-y-6">
          {status === "success" && (
            <p className="wos-alert info">
              申し込みを受け付けました。Stripe からの確認が完了次第、プランが反映されます（数秒〜数十秒）。
            </p>
          )}
          {status === "cancel" && (
            <p className="wos-alert warn">
              申し込みをキャンセルしました。
            </p>
          )}
          {status === "no-customer" && (
            <p className="wos-alert warn">
              まだ Stripe Customer が作成されていません。先に申し込みを完了してください。
            </p>
          )}

          {/* 現在のプラン */}
          <section className="wos-card space-y-3">
            <div className="wos-sec-label">現在の契約状態</div>
            <dl className="grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
              <dt className="text-[var(--color-ink-mid)]">プラン</dt>
              <dd>{PLAN_LABEL[sub?.plan ?? "free"] ?? "—"}</dd>
              <dt className="text-[var(--color-ink-mid)]">ステータス</dt>
              <dd>
                <span
                  className="inline-block border px-2 py-0.5 text-xs"
                  style={{
                    borderColor: statusOk
                      ? "var(--color-go)"
                      : "var(--color-warn)",
                    color: statusOk
                      ? "var(--color-go)"
                      : "var(--color-warn)",
                  }}
                >
                  {statusLabel}
                </span>
              </dd>
              <dt className="text-[var(--color-ink-mid)]">マイページ</dt>
              <dd>{mypageOn ? "ON" : "OFF"}</dd>
              {sub?.plan === "trial" && sub.trial_ends_at && (
                <>
                  <dt className="text-[var(--color-ink-mid)]">試用期限</dt>
                  <dd>
                    {formatDateJp(sub.trial_ends_at)}
                    {trialExpired && (
                      <span className="ml-1 text-[var(--color-warn)]">
                        （終了）
                      </span>
                    )}
                  </dd>
                </>
              )}
              {sub?.stripe_subscription_id && (
                <>
                  <dt className="text-[var(--color-ink-mid)]">契約ID</dt>
                  <dd className="font-mono text-xs text-[var(--color-ink-mid)]">
                    {sub.stripe_subscription_id}
                  </dd>
                </>
              )}
            </dl>
          </section>

          {/* 申し込み or 管理 */}
          {isPaidActive ? (
            <section className="wos-card space-y-3">
              <div className="wos-sec-label">プラン管理</div>
              <p className="text-sm text-[var(--color-ink-mid)]">
                請求書履歴の確認・支払い方法の変更・解約は Stripe のお客様ポータルから行えます。
              </p>
              <form action={openCustomerPortal}>
                <button type="submit" className="wos-btn wos-btn-sm">
                  お客様ポータルを開く
                </button>
              </form>
              {!mypageOn && (
                <p className="text-xs text-[var(--color-ink-light)] pt-2 border-t border-[var(--color-line)]">
                  マイページオプションの追加もポータルから行えます。
                </p>
              )}
            </section>
          ) : isSpecialFree ? (
            <section className="wos-card space-y-3">
              <div className="wos-sec-label">プラン管理</div>
              <p className="text-sm text-[var(--color-ink-mid)]">
                現在「特別無料プラン」でご利用いただいています。お支払いの手続きは不要です。
              </p>
              <p className="text-xs text-[var(--color-ink-light)] pt-2 border-t border-[var(--color-line)]">
                プラン内容のご相談は{" "}
                <a
                  href="mailto:info@hiiragi-tech.app"
                  className="underline underline-offset-2 text-[var(--color-ink-mid)]"
                >
                  info@hiiragi-tech.app
                </a>{" "}
                までお問い合わせください。
              </p>
            </section>
          ) : (
            <BillingForm defaultMypage={false} />
          )}
        </div>
      </div>
    </>
  );
}
