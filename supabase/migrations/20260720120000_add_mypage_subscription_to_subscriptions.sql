-- お客様マイページオプションを「独立した Stripe subscription」で管理するための土台。
--
-- 背景（DECISIONS.md / 2026-07-20 合意）:
--   Stripe のトライアルは subscription 単位でしか設定できず、per-item trial_end は存在しない。
--   「基本プランはトライアル中でも、マイページオプションは即課金」を実現するには、
--   マイページを基本プランとは別の subscription に分けるしかない。
--   → 基本プラン用の stripe_subscription_id とは別に、オプション用の id 列を追加する。
--
-- 解約予約（期間末まで有効・返金なし）の状態は options.mypage_cancel_at(jsonb) に持つため、
-- ここでは列追加は subscription_id のみ（jsonb はスキーマ変更不要）。

alter table public.subscriptions
  add column if not exists stripe_mypage_subscription_id text;

-- 1つの Stripe subscription が複数テナントに紐づかないよう部分ユニーク（既存2列と同作法）。
create unique index if not exists subscriptions_stripe_mypage_subscription_id_uidx
  on public.subscriptions (stripe_mypage_subscription_id)
  where stripe_mypage_subscription_id is not null;
