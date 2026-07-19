import type { Subscription } from "@/lib/types";

// マイページオプションの契約状態（UI表示・分岐用）。
//   status:
//     "none"      … 未契約（未契約 or 完全失効）。
//     "active"    … 契約中（利用可・次回更新で継続）。
//     "canceling" … 解約予約中（期間末まで利用可・返金なし）。cancelAt に最終日時。
export type MypageOptionStatus = "none" | "active" | "canceling";

export type MypageOptionState = {
  status: MypageOptionStatus;
  // 解約予約中のときの利用可能な最終日時（ISO）。それ以外は null。
  cancelAt: string | null;
};

// Subscription 行からマイページオプションの状態を導出する純関数。
//   有効判定は options.mypage を正とし（webhook が Stripe から同期）、
//   解約予約は options.mypage_cancel_at の有無で判定する。
export function getMypageOptionState(
  sub: Pick<Subscription, "options"> | null,
): MypageOptionState {
  const active = sub?.options?.mypage === true;
  if (!active) return { status: "none", cancelAt: null };

  const cancelAt = sub?.options?.mypage_cancel_at ?? null;
  if (cancelAt) return { status: "canceling", cancelAt };

  return { status: "active", cancelAt: null };
}
