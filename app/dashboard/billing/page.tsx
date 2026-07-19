import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { evaluateAccess } from "@/lib/subscription";
import { getMypageOptionState } from "@/lib/billing/options";
import type { Subscription } from "@/lib/types";
import BillingForm from "./billing-form";
import {
  addMypageOption,
  openCustomerPortal,
  removeMypageOption,
} from "./actions";

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

const STATUS_ALERTS: Record<string, { tone: "info" | "warn"; text: string }> = {
  success: {
    tone: "info",
    text: "申し込みを受け付けました。Stripe からの確認が完了次第、プランが反映されます（数秒〜数十秒）。",
  },
  cancel: { tone: "warn", text: "申し込みをキャンセルしました。" },
  "no-customer": {
    tone: "warn",
    text: "まだ Stripe Customer が作成されていません。先に申し込みを完了してください。",
  },
  "option-added": {
    tone: "info",
    text: "お客様マイページオプションを追加しました。反映まで数秒〜数十秒かかることがあります。",
  },
  "option-cancel": {
    tone: "warn",
    text: "オプションの追加をキャンセルしました。",
  },
  "option-active": {
    tone: "info",
    text: "お客様マイページオプションは既に契約中です。",
  },
  "option-resumed": {
    tone: "info",
    text: "オプションの解約予約を取り消しました。引き続きご利用いただけます。",
  },
  "option-cancel-scheduled": {
    tone: "warn",
    text: "オプションの解約を予約しました。現在の請求期間末まではご利用いただけます。",
  },
  "no-option": {
    tone: "warn",
    text: "契約中のオプションが見つかりませんでした。",
  },
};

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
  // 特別無料（無料協力者）プラン。課金なしで恒久有効のため、申し込み・オプションUIは出さない。
  const isSpecialFree = sub?.plan === "special_free";
  const mypageOption = getMypageOptionState(sub);

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

  const alert = status ? STATUS_ALERTS[status] : undefined;

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
          {alert && (
            <p className={`wos-alert ${alert.tone}`}>{alert.text}</p>
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
              <dd>
                {mypageOption.status === "active"
                  ? "契約中"
                  : mypageOption.status === "canceling"
                    ? `解約予約中（${formatDateJp(mypageOption.cancelAt)}まで）`
                    : "OFF"}
              </dd>
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

          {/* 基本プラン: 申し込み or 管理 */}
          {isSpecialFree ? (
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
          ) : isPaidActive ? (
            <section className="wos-card space-y-3">
              <div className="wos-sec-label">基本プラン</div>
              <p className="text-sm text-[var(--color-ink-mid)]">
                請求書履歴の確認・支払い方法の変更・解約は Stripe のお客様ポータルから行えます。
              </p>
              <form action={openCustomerPortal}>
                <button type="submit" className="wos-btn wos-btn-sm">
                  お客様ポータルを開く
                </button>
              </form>
            </section>
          ) : (
            <BillingForm />
          )}

          {/* お客様マイページオプション（特別無料以外に常時表示。トライアル中でも追加可＝即課金） */}
          {!isSpecialFree && (
            <MypageOptionSection state={mypageOption} />
          )}
        </div>
      </div>
    </>
  );
}

function MypageOptionSection({
  state,
}: {
  state: ReturnType<typeof getMypageOptionState>;
}) {
  return (
    <section className="wos-card space-y-3">
      <div className="wos-sec-label">お客様マイページオプション</div>
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-medium">お客様向けマイページ機能</div>
        <div className="wos-yen text-base">
          月額 ¥980
          <span className="text-xs text-[var(--color-ink-light)] ml-1">
            税込
          </span>
        </div>
      </div>
      <p className="text-xs text-[var(--color-ink-light)]">
        受注ごとに顧客専用URLを発行し、作業状況を共有できる機能です。トライアル対象外で、追加した時点から課金されます（日割りなし・当月分から）。
      </p>

      {state.status === "active" ? (
        <div className="pt-2 border-t border-[var(--color-line)] space-y-2">
          <p className="text-sm text-[var(--color-go)]">契約中</p>
          <form action={removeMypageOption}>
            <button type="submit" className="wos-btn wos-btn-sm wos-btn-ghost">
              オプションを解約する
            </button>
          </form>
          <p className="text-xs text-[var(--color-ink-light)]">
            解約しても現在の請求期間末までは利用でき、返金はありません。
          </p>
        </div>
      ) : state.status === "canceling" ? (
        <div className="pt-2 border-t border-[var(--color-line)] space-y-2">
          <p className="text-sm text-[var(--color-warn)]">
            解約予約中（{formatDateJp(state.cancelAt)}まで利用可）
          </p>
          <form action={addMypageOption}>
            <button type="submit" className="wos-btn wos-btn-sm">
              解約を取り消す
            </button>
          </form>
        </div>
      ) : (
        <div className="pt-2 border-t border-[var(--color-line)] space-y-2">
          <p className="text-sm text-[var(--color-ink-mid)]">未契約</p>
          <form action={addMypageOption}>
            <button type="submit" className="wos-btn wos-btn-sm">
              ¥980/月で追加する
            </button>
          </form>
          <p className="text-xs text-[var(--color-ink-light)]">
            「追加」を押すと Stripe の決済ページへ遷移し、カード登録後すぐに有効化されます。
          </p>
        </div>
      )}
    </section>
  );
}
