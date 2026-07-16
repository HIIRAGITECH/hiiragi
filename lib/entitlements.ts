import type { User } from "@supabase/supabase-js";
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
// 高速化: 呼び出し側が既に取得済みの user を渡せば、isAdmin 判定・subscriptions 取得ともに
// その user を使い、getUser() のネットワーク往復（従来 isAdmin＋本体で最大2回）を省く。
//   - user を渡した場合＝getUser しない。渡さなければ（undefined）従来どおり取得（既存呼び出しは無改修で動く）。
export async function canUseMypage(user?: User | null): Promise<boolean> {
  if (await isAdmin(user)) return true;

  const supabase = await createClient();
  let resolved = user;
  if (resolved === undefined) {
    const { data } = await supabase.auth.getUser();
    resolved = data.user;
  }
  if (!resolved) return false;

  // subscriptions は RLS でオーナー限定。authenticated クライアントで自テナント1行を読む。
  const { data } = await supabase
    .from("subscriptions")
    .select("options")
    .eq("user_id", resolved.id)
    .maybeSingle();

  const options = (data?.options ?? {}) as SubscriptionOptions;
  return options.mypage === true;
}
