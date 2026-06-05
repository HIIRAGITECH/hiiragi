import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe, STRIPE_PRICE_BASIC, STRIPE_PRICE_MYPAGE } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SubscriptionOptions } from "@/lib/types";

// Stripe からの POST だけ受ける。署名検証必須。
// 認証は不要（proxy.ts の matcher で /api は除外済み）。

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

// Stripe Subscription の状態を subscriptions テーブルに反映する。
// option フラグの mypage だけ price 構成から判定し、line_notify / hp_integration は
// 管理者画面で操作する独立フラグなので既存値を温存する。
async function applySubscriptionState(
  sub: Stripe.Subscription,
  userIdHint?: string,
) {
  const userId = userIdHint || sub.metadata?.user_id;
  if (!userId) {
    console.warn(
      "[stripe webhook] subscription event without user_id",
      sub.id,
    );
    return;
  }

  const priceIds = new Set(sub.items.data.map((i) => i.price.id));
  const hasMypage = STRIPE_PRICE_MYPAGE
    ? priceIds.has(STRIPE_PRICE_MYPAGE)
    : false;
  const hasBasic = STRIPE_PRICE_BASIC
    ? priceIds.has(STRIPE_PRICE_BASIC)
    : false;

  // active / trialing をアクティブ扱い。past_due・unpaid・canceled は suspended。
  const isActive = sub.status === "active" || sub.status === "trialing";

  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  const admin = createAdminClient();

  // 既存 options をマージして mypage だけ Stripe 由来で上書きする。
  const { data: existing } = await admin
    .from("subscriptions")
    .select("options")
    .eq("user_id", userId)
    .maybeSingle();
  const existingOptions = (existing?.options ?? {}) as SubscriptionOptions;
  const mergedOptions: SubscriptionOptions = {
    ...existingOptions,
    mypage: hasMypage,
  };

  const plan = isActive && hasBasic ? "paid" : isActive ? "paid" : "free";

  const { error } = await admin
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        plan,
        status: isActive ? "active" : "suspended",
        stripe_customer_id: customerId,
        stripe_subscription_id: sub.id,
        options: mergedOptions,
      },
      { onConflict: "user_id" },
    );

  if (error) {
    throw new Error(`subscriptions upsert failed: ${error.message}`);
  }
}

// 解約・期限切れ。status='suspended' に倒し、stripe_subscription_id をクリア。
async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const userId = sub.metadata?.user_id;
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  const admin = createAdminClient();
  const query = admin
    .from("subscriptions")
    .update({
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
