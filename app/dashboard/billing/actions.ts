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
import type { Subscription } from "@/lib/types";

// Stripe Checkout (subscription mode) のセッションを作成して URL にリダイレクト。
// 基本プランは必須、formData の add_mypage=on でマイページオプションを追加。
export async function createCheckoutSession(formData: FormData) {
  if (!STRIPE_PRICE_BASIC) {
    throw new Error("STRIPE_PRICE_BASIC が設定されていません。");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: subRow } = await admin
    .from("subscriptions")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  const sub = subRow as Subscription | null;

  const addMypage = formData.get("add_mypage") === "on";

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    { price: STRIPE_PRICE_BASIC, quantity: 1 },
  ];
  if (addMypage && STRIPE_PRICE_MYPAGE) {
    lineItems.push({ price: STRIPE_PRICE_MYPAGE, quantity: 1 });
  }

  const stripe = getStripe();
  const siteUrl = await getSiteUrl();

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    line_items: lineItems,
    success_url: `${siteUrl}/dashboard/billing?status=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/dashboard/billing?status=cancel`,
    client_reference_id: user.id,
    // webhook 側で user を特定できるよう subscription にも user_id を埋め込む。
    subscription_data: {
      metadata: { user_id: user.id },
    },
    metadata: { user_id: user.id },
    allow_promotion_codes: true,
  };

  // 既に Stripe Customer がある場合は再利用。
  // 無い場合は customer_email でメール事前入力するが、customer は Stripe 側で新規作成させる。
  if (sub?.stripe_customer_id) {
    params.customer = sub.stripe_customer_id;
  } else if (user.email) {
    params.customer_email = user.email;
  }

  const session = await stripe.checkout.sessions.create(params);

  if (!session.url) {
    throw new Error("Stripe Checkout の URL が取得できませんでした。");
  }
  redirect(session.url);
}

// Customer Portal を開く。解約・支払い方法の変更などはここで行う。
export async function openCustomerPortal() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: subRow } = await admin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const customerId = (subRow as { stripe_customer_id: string | null } | null)
    ?.stripe_customer_id;
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
