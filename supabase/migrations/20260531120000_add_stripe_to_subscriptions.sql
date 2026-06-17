-- Stripe 連携カラムを subscriptions に追加。
-- stripe_customer_id     : Stripe Customer の id（cus_xxx）。1 ユーザ 1 customer。
-- stripe_subscription_id : Stripe Subscription の id（sub_xxx）。アクティブ契約の参照。
-- どちらも未契約ユーザは NULL。webhook 受信で確定する。

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id     text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_stripe_customer_id_uidx
  ON public.subscriptions(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_stripe_subscription_id_uidx
  ON public.subscriptions(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
