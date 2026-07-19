import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { classifyPriceIds, getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SubscriptionOptions } from "@/lib/types";

// Stripe からの POST だけ受ける。署名検証必須。
// 認証は不要（proxy.ts の matcher で /api は除外済み）。
//
// 課金構造（DECISIONS.md / 2026-07-20）:
//   基本プラン用 subscription と マイページオプション用 subscription は別物。
//   どのイベントがどちらの subscription かは price 構成（classifyPriceIds）で判定し、
//   - base  → subscriptions.plan / status / stripe_subscription_id を更新（options.mypage は触らない）
//   - mypage→ options.mypage / stripe_mypage_subscription_id を更新（plan / status は触らない）
//   と、担当列を厳密に分離する（片方のイベントで他方を上書きしない）。

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new Response("missing stripe-signature header", { status: 400 });
  }

  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!whSecret || whSecret === "whsec_REPLACE_ME") {
    return new Response("STRIPE_WEBHOOK_SECRET not configured", { status: 500 });
  }

  // 署名検証用に raw body を取得（パース前）。
  const rawBody = await request.text();

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      whSecret,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(`signature verification failed: ${msg}`, {
      status: 400,
    });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await applySubscriptionState(event.data.object);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object);
        break;
      default:
        // 想定外イベントは無視（ログだけ残す）
        break;
    }
  } catch (err) {
    console.error("[stripe webhook] handler error:", err);
    return new Response("handler error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  if (session.mode !== "subscription") return;

  const userId =
    session.client_reference_id || (session.metadata?.user_id ?? null);
  if (!userId) {
    console.warn(
      "[stripe webhook] checkout.session.completed without user_id",
      session.id,
    );
    return;
  }

  const subId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;
  if (!subId) return;

  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(subId);
  await applySubscriptionState(sub, userId);
}

// subscription イベントの共通入口。price 構成で base / mypage を振り分ける。
async function applySubscriptionState(
  sub: Stripe.Subscription,
  userIdHint?: string,
) {
  const userId = userIdHint || sub.metadata?.user_id;
  if (!userId) {
    console.warn("[stripe webhook] subscription event without user_id", sub.id);
    return;
  }

  const kind = classifyPriceIds(sub.items.data.map((i) => i.price.id));
  if (kind === "mypage") {
    await applyMypageSubscription(sub, userId);
  } else {
    // base または unknown（基本プラン扱い）。従来の挙動を踏襲。
    await applyBaseSubscription(sub, userId);
  }
}

// 基本プラン subscription の状態を反映する。options.mypage は触らない。
async function applyBaseSubscription(sub: Stripe.Subscription, userId: string) {
  const isActive = sub.status === "active" || sub.status === "trialing";
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  // base 単一 subscription 前提なので plan は active 判定だけで決まる。
  const plan = isActive ? "paid" : "free";

  const admin = createAdminClient();
  const { error } = await admin.from("subscriptions").upsert(
    {
      user_id: userId,
      plan,
      status: isActive ? "active" : "suspended",
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw new Error(`subscriptions upsert (base) failed: ${error.message}`);
  }
}

// マイページオプション subscription の状態を反映する。plan / status は触らない。
//   active/trialing → options.mypage=true。past_due 等の非有効は false（機能ロック）。
//   cancel_at_period_end のときは mypage_cancel_at に最終日時を入れる（期間末まで true 継続）。
async function applyMypageSubscription(
  sub: Stripe.Subscription,
  userId: string,
) {
  const isActive = sub.status === "active" || sub.status === "trialing";
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  const cancelAtIso =
    isActive && sub.cancel_at_period_end && sub.cancel_at
      ? new Date(sub.cancel_at * 1000).toISOString()
      : null;

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("subscriptions")
    .select("options")
    .eq("user_id", userId)
    .maybeSingle();
  const existingOptions = (existing?.options ?? {}) as SubscriptionOptions;
  const mergedOptions: SubscriptionOptions = {
    ...existingOptions,
    mypage: isActive,
    mypage_cancel_at: cancelAtIso,
  };

  // plan/status は base 側の担当なので触らない。subscriptions 行はサインアップ時の
  // トリガーで必ず存在するため upsert ではなく update（upsert だと NOT NULL の plan を
  // 渡さない INSERT 行が組み立てられ not-null 違反で落ちる）。
  const { error } = await admin
    .from("subscriptions")
    .update({
      // 顧客IDは基本プラン契約前でも埋めておく（オプション先行契約に対応）。
      stripe_customer_id: customerId,
      stripe_mypage_subscription_id: isActive ? sub.id : null,
      options: mergedOptions,
    })
    .eq("user_id", userId);

  if (error) {
    throw new Error(`subscriptions update (mypage) failed: ${error.message}`);
  }
}

// 解約・期限切れ。どちらの subscription かを price 構成で判定して該当列だけ倒す。
async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const userId = sub.metadata?.user_id;
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const kind = classifyPriceIds(sub.items.data.map((i) => i.price.id));
  const admin = createAdminClient();

  if (kind === "mypage") {
    // マイページ失効: options.mypage=false + 予約マーク・sub_id クリア。plan/status は不変。
    const { data: existing } = await admin
      .from("subscriptions")
      .select("options")
      .eq("user_id", userId ?? "")
      .maybeSingle();
    const existingOptions = (existing?.options ?? {}) as SubscriptionOptions;
    const mergedOptions: SubscriptionOptions = {
      ...existingOptions,
      mypage: false,
      mypage_cancel_at: null,
    };

    const query = admin.from("subscriptions").update({
      options: mergedOptions,
      stripe_mypage_subscription_id: null,
    });
    const { error } = userId
      ? await query.eq("user_id", userId)
      : await query.eq("stripe_mypage_subscription_id", sub.id);
    if (error) {
      throw new Error(`mypage delete failed: ${error.message}`);
    }
    return;
  }

  // 基本プラン失効: status=suspended + stripe_subscription_id クリア。
  const query = admin.from("subscriptions").update({
    status: "suspended",
    stripe_subscription_id: null,
  });
  const { error } = userId
    ? await query.eq("user_id", userId)
    : await query.eq("stripe_customer_id", customerId);
  if (error) {
    throw new Error(`subscriptions update on delete failed: ${error.message}`);
  }
}
