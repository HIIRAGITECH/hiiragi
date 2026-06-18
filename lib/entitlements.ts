import { isAdmin } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";
import type { SubscriptionOptions } from "@/lib/types";

// 機能の使用権（エンタイトルメント）判定。サーバー側専用。
//
// 設計方針（DECISIONS.md 準拠）:
//   「機能は全員に存在するが、有効な人だけ使える」。メールアドレス分岐ではなくデータ(options)で判定する。
//   ただし管理者（ADMIN_EMAIL）は options に関係なく全機能を無制限・無料で使える。

// マイページ機能（お客様向けマイページURLの発行）を使えるか。
//   1. 管理者(ADMIN_EMAIL)なら無制限で true
//   2. それ以外は subscriptions.options.mypage === true なら true
//   3. それ以外は false
export async function canUseMypage(): Promise<boolean> {
  if (await isAdmin()) return true;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  // subscriptions は RLS でオーナー限定。authenticated クライアントで自テナント1行を読む。
  const { data } = await supabase
    .from("subscriptions")
    .select("options")
    .eq("user_id", user.id)
    .maybeSingle();

  const options = (data?.options ?? {}) as SubscriptionOptions;
  return options.mypage === true;
}
