"use server";

import { redirect } from "next/navigation";
import type Stripe from "stripe";
import {
  getStripe,
  STRIPE_PRICE_BASIC,
  STRIPE_PRICE_MYPAGE,
} from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";
import type { Subscription, SubscriptionOptions } from "@/lib/types";

// 課金構造（DECISIONS.md / 2026-07-20 合意）:
//   基本プラン … 従来どおり。DBトリガーの30日トライアル → この Checkout で契約（即課金）。
//                stripe_subscription_id に保存。
//   マイページオプション … 基本とは「別の subscription」。トライアル対象外・追加した瞬間に即課金。
//                stripe_mypage_subscription_id に保存。基本のトライアル状態に一切影響しない。
//   ※ Stripe のトライアルは subscription 単位でしか設定できず per-item trial_end は存在しないため、
//      「基本トライアル中でもオプションだけ即課金」は両者を別 subscription に分けることでのみ実現できる。

// 現在ログイン中ユーザーの subscription 行を取得（service role・RLSバイパス）。
async function getCurrentUserAndSub(): Promise<{
  userId: string;
  email: string | null;
  sub: Subscription | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data } = await admin
    .from("subscriptions")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  return {
    userId: user.id,
    email: user.email ?? null,
    sub: (data as Subscription | null) ?? null,
  };
}

// 基本プランの Stripe Checkout（subscription mode）を作成して遷移する。
// マイページオプションはここには含めない（別 subscription で管理するため）。
export async function createCheckoutSession() {
  if (!STRIPE_PRICE_BASIC) {
    throw new Error("STRIPE_PRICE_BASIC が設定されていません。");
  }

  const { userId, email, sub } = await getCurrentUserAndSub();
  const stripe = getStripe();
  const siteUrl = await getSiteUrl();

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    line_items: [{ price: STRIPE_PRICE_BASIC, quantity: 1 }],
    success_url: `${siteUrl}/dashboard/billing?status=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/dashboard/billing?status=cancel`,
    client_reference_id: userId,
    subscription_data: { metadata: { user_id: userId } },
    metadata: { user_id: userId },
    allow_promotion_codes: true,
  };

  // 既に Stripe Customer があれば再利用（オプション先行契約者を含む）。無ければメール事前入力。
  if (sub?.stripe_customer_id) {
    params.customer = sub.stripe_customer_id;
  } else if (email) {
    params.customer_email = email;
  }

  const session = await stripe.checkout.sessions.create(params);
  if (!session.url) {
    throw new Error("Stripe Checkout の URL が取得できませんでした。");
  }
  redirect(session.url);
}

// マイページオプションを追加する（即課金）。状態別に3分岐:
//   1) 既存オプション sub が「解約予約中」→ 予約解除（cancel_at_period_end=false）。課金なし・継続。
//   2) 既存オプション sub が有効で予約なし → 何もしない（二重契約防止）。
//   3) オプション sub 無し → Checkout（subscription mode）でカード確認＋即課金して新規作成。
export async function addMypageOption() {
  if (!STRIPE_PRICE_MYPAGE) {
    throw new Error("STRIPE_PRICE_MYPAGE が設定されていません。");
  }

  const { userId, email, sub } = await getCurrentUserAndSub();
  const stripe = getStripe();

  // 既存のオプション subscription があるか確認。
  if (sub?.stripe_mypage_subscription_id) {
    const existing = await stripe.subscriptions.retrieve(
      sub.stripe_mypage_subscription_id,
    );
    const alive =
      existing.status === "active" || existing.status === "trialing";
    if (alive) {
      if (existing.cancel_at_period_end) {
        // 1) 解約予約の取り消し。
        await stripe.subscriptions.update(existing.id, {
          cancel_at_period_end: false,
        });
        // DBの解約予約マークを即クリア（webhook でも同期されるが即時反映のため）。
        await clearMypageCancelMark(userId);
        redirect("/dashboard/billing?status=option-resumed");
      }
      // 2) 既に有効。
      redirect("/dashboard/billing?status=option-active");
    }
    // status が canceled 等（実質失効）なら 3) へフォールバックして新規作成する。
  }

  // 3) 新規: Checkout でカードを取得しつつオプション専用 subscription を作る（即課金）。
  const siteUrl = await getSiteUrl();
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    line_items: [{ price: STRIPE_PRICE_MYPAGE, quantity: 1 }],
    success_url: `${siteUrl}/dashboard/billing?status=option-added`,
    cancel_url: `${siteUrl}/dashboard/billing?status=option-cancel`,
    client_reference_id: userId,
    subscription_data: { metadata: { user_id: userId, kind: "mypage" } },
    metadata: { user_id: userId, kind: "mypage" },
  };
  if (sub?.stripe_customer_id) {
    params.customer = sub.stripe_customer_id;
  } else if (email) {
    params.customer_email = email;
  }

  const session = await stripe.checkout.sessions.create(params);
  if (!session.url) {
    throw new Error("Stripe Checkout の URL が取得できませんでした。");
  }
  redirect(session.url);
}

// マイページオプションを解約する。期間末まで有効・返金なし（cancel_at_period_end=true）。
// 実際の失効（options.mypage=false）は期間末の customer.subscription.deleted で反映される。
export async function removeMypageOption() {
  const { userId, sub } = await getCurrentUserAndSub();
  const optionSubId = sub?.stripe_mypage_subscription_id;
  if (!optionSubId) {
    redirect("/dashboard/billing?status=no-option");
  }

  const stripe = getStripe();
  const updated = await stripe.subscriptions.update(optionSubId, {
    cancel_at_period_end: true,
  });

  // 利用可能な最終日時（= cancel_at）を即座にDBへ記録し、UIに「解約予約中」を出す。
  // webhook（customer.subscription.updated）でも同じ値が同期される。
  const cancelAtIso = updated.cancel_at
    ? new Date(updated.cancel_at * 1000).toISOString()
    : null;
  await setMypageCancelMark(userId, cancelAtIso);

  redirect("/dashboard/billing?status=option-cancel-scheduled");
}

// options.mypage_cancel_at を設定/クリアする小ヘルパー（他キー非破壊）。
async function setMypageCancelMark(userId: string, cancelAtIso: string | null) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("subscriptions")
    .select("options")
    .eq("user_id", userId)
    .maybeSingle();
  const options = (data?.options ?? {}) as SubscriptionOptions;
  await admin
    .from("subscriptions")
    .update({ options: { ...options, mypage_cancel_at: cancelAtIso } })
    .eq("user_id", userId);
}

async function clearMypageCancelMark(userId: string) {
  await setMypageCancelMark(userId, null);
}

// Customer Portal を開く。請求履歴・支払い方法の変更・解約はここでも行える。
export async function openCustomerPortal() {
  const { sub } = await getCurrentUserAndSub();
  const customerId = sub?.stripe_customer_id;
  if (!customerId) {
    redirect("/dashboard/billing?status=no-customer");
  }

  const stripe = getStripe();
  const siteUrl = await getSiteUrl();
  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${siteUrl}/dashboard/billing`,
  });
  redirect(portal.url);
}
