import { diffDaysFromJst, getTodayJst } from "@/lib/payments/classify";
import type { Subscription } from "@/lib/types";

// 注意: このモジュールは middleware（edge）からも `evaluateAccess` が import される。
// そのためトップレベルでは純粋な依存（classify/types）だけに留め、
// next/headers を巻き込む server 依存（@/lib/admin・@/lib/supabase/server）は
// getAccessState 内で動的 import する（middleware の edge バンドルを汚さないため）。

// 課金アクセス制御（完全ロック型）の判定。サーバー側専用。
//
// 設計方針（DECISIONS.md / 2026-06-20 合意）:
//   有効(valid) =
//     plan==='trial' ? (status==='active' && trial_ends_at が未来)  // trial は期限で判定（status無視）
//                    : (status==='active')                          // paid / special_free は status で判定
//   それ以外（トライアル切れ・status=suspended）は完全ロック。
//   ※ trial は trigger で常に status='active' のため、status を見ると永久に切れない。
//      期限切れを効かせるため trial だけは trial_ends_at で判定する。
//   管理者(ADMIN_EMAIL)は常にバイパス（ロックされない・警告も不要）= getAccessState 側で処理。
//
// canUseMypage()（option軸の機能ゲート）とは役割が異なるため独立させている。

export type AccessEvaluation = {
  // true = ダッシュボードをロックすべき。
  locked: boolean;
  // trial の残り日数（JST基準）。trial 以外・sub無しは null。警告バナー用。
  trialDaysLeft: number | null;
};

// 純粋関数：subscription（または null）と現在時刻から locked / trialDaysLeft を導出する。
// 時刻を引数で受けるのでテスト可能。nowMs は Date.now() を想定。
export function evaluateAccess(
  sub: Pick<Subscription, "plan" | "status" | "trial_ends_at"> | null,
  nowMs: number,
): AccessEvaluation {
  // sub が無い＝判定材料が無いので安全側に倒してロック。
  if (!sub) return { locked: true, trialDaysLeft: null };

  if (sub.plan === "trial") {
    // trial: status=active かつ 期限が未来なら有効。
    const notExpired =
      sub.trial_ends_at != null && new Date(sub.trial_ends_at).getTime() > nowMs;
    const valid = sub.status === "active" && notExpired;

    // 残り日数は JST 日付ベースで算出（既存ヘルパー流用）。
    const trialDaysLeft = trialDaysLeftJst(sub.trial_ends_at);

    return { locked: !valid, trialDaysLeft };
  }

  // paid / special_free: status==='active' なら有効（期限は見ない）。
  //   special_free = 無料協力者向けの区分。課金なしで恒久有効化するためのもので、
  //   判定ロジックは paid と完全に同一（status のみ）。plan 値を分けているのは
  //   DB上で課金ユーザーと見分ける（集計・解約フロー等で区別する）ためだけ。
  if (sub.plan === "paid" || sub.plan === "special_free") {
    return { locked: sub.status !== "active", trialDaysLeft: null };
  }

  // free（その他・後方互換）: 同様に status で判定。
  return { locked: sub.status !== "active", trialDaysLeft: null };
}

// trial_ends_at(timestamptz/ISO) を JST の YYYY-MM-DD に変換し、今日(JST)との日数差を返す。
// 既存の getTodayJst / diffDaysFromJst を流用して DST・オフセットの影響を排除する。
function trialDaysLeftJst(trialEndsAt: string | null): number | null {
  if (!trialEndsAt) return null;
  const endJst = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
  }).format(new Date(trialEndsAt));
  return diffDaysFromJst(endJst, getTodayJst());
}

export type AccessState = {
  isAdmin: boolean;
  locked: boolean;
  trialDaysLeft: number | null;
};

// current user の subscription を取得し、admin 判定を含めたアクセス状態を返す。
// 管理者は常に locked=false / trialDaysLeft=null（警告不要）。
export async function getAccessState(): Promise<AccessState> {
  const { isAdmin } = await import("@/lib/admin");
  if (await isAdmin()) {
    return { isAdmin: true, locked: false, trialDaysLeft: null };
  }

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // 未ログインは呼び出し側でハンドル済みの想定だが、安全側でロック扱い。
  if (!user) return { isAdmin: false, locked: true, trialDaysLeft: null };

  // subscriptions は RLS でオーナー限定。authenticated クライアントで自テナント1行を読む。
  const { data } = await supabase
    .from("subscriptions")
    .select("plan, status, trial_ends_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const evaluation = evaluateAccess(
    data as Pick<Subscription, "plan" | "status" | "trial_ends_at"> | null,
    Date.now(),
  );

  return { isAdmin: false, ...evaluation };
}
