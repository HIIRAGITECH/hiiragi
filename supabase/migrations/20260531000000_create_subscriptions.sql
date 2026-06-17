-- ユーザ単位の契約・プラン管理（管理者画面で参照・編集する）。
-- 書き込みは service_role 経由の admin client でのみ行う想定なので、
-- RLS は本人 SELECT のみ許可し、INSERT/UPDATE/DELETE ポリシは作らない。

CREATE TABLE IF NOT EXISTS subscriptions (
  id             text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan           text NOT NULL
    CHECK (plan IN ('free','paid','trial','special_free')),
  status         text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','suspended')),
  trial_ends_at  timestamptz,
  options        jsonb NOT NULL DEFAULT '{}'::jsonb,
  memo           text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- 1 ユーザ 1 サブスクリプション
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_user_id_uidx
  ON subscriptions(user_id);

DROP TRIGGER IF EXISTS subscriptions_touch_updated_at ON subscriptions;
CREATE TRIGGER subscriptions_touch_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subscriptions_owner_select ON subscriptions;
CREATE POLICY subscriptions_owner_select ON subscriptions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ============================================================
-- 新規ユーザ登録時に subscriptions レコードを自動作成する。
-- plan='trial', status='active', trial_ends_at=登録から30日後。
-- options は今後追加し得るフラグを初期 false で持たせておく。
-- SECURITY DEFINER で関数オーナ権限で実行し、RLS をバイパスして INSERT する。
-- ============================================================
CREATE OR REPLACE FUNCTION create_default_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.subscriptions (
    user_id, plan, status, trial_ends_at, options
  ) VALUES (
    NEW.id,
    'trial',
    'active',
    now() + interval '30 days',
    '{"mypage": false, "line_notify": false, "hp_integration": false}'::jsonb
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- SECURITY DEFINER 関数を /rest/v1/rpc 経由で呼べないように EXECUTE を剥がす。
-- トリガからの呼び出しは関数オーナ権限で動くので影響なし。
REVOKE EXECUTE ON FUNCTION public.create_default_subscription() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_default_subscription() FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_default_subscription() FROM authenticated;

DROP TRIGGER IF EXISTS auth_users_create_subscription ON auth.users;
CREATE TRIGGER auth_users_create_subscription
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_default_subscription();

-- ============================================================
-- 既存ユーザへのバックフィル
-- まだ subscriptions が無いユーザを trial(30日) で埋める。
-- ============================================================
INSERT INTO public.subscriptions (
  user_id, plan, status, trial_ends_at, options
)
SELECT
  u.id,
  'trial',
  'active',
  now() + interval '30 days',
  '{"mypage": false, "line_notify": false, "hp_integration": false}'::jsonb
FROM auth.users u
LEFT JOIN public.subscriptions s ON s.user_id = u.id
WHERE s.id IS NULL;
