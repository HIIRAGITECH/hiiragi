import type { EstimateStatus, WorkStatus } from "@/lib/types";

// ============================================================================
// お客様マイページ 進捗フェーズ算出（純粋関数）
// ============================================================================
//
// work_status / estimate_status は独立に動き「飛び」がある（例: 了承済を経ずに
// 完了になる）。そのため個別ステータスを直列に並べるのではなく、各ステータスから
// 「到達した最大フェーズ」を1つだけ選ぶ方式にする。
//   完了            = work_status:完了
//   作業中          = work_status:作業中
//   ご了承・作業開始 = estimate_status:了承済
//   お見積り        = estimate_status:発行済
//   受注受付        = それ以外
//
// 表示は「reached.index 以下のフェーズはすべて到達済み」として描くので、途中フェーズ
// （例: 了承）が飛んでいても進捗バーは破綻しない。

export const MYPAGE_PHASES = [
  "受注受付",
  "お見積り",
  "ご了承・作業開始",
  "作業中",
  "作業完了",
] as const;

export type MypagePhase = (typeof MYPAGE_PHASES)[number];

export type MypagePhaseResult = {
  phase: MypagePhase;
  index: number; // 0..4（到達した最大フェーズ）
};

export function resolvePhase(input: {
  work_status: WorkStatus;
  estimate_status: EstimateStatus;
}): MypagePhaseResult {
  const { work_status, estimate_status } = input;
  // 到達点が高い条件から順に判定し、最初に当たったものを現在地とする。
  if (work_status === "完了") return { phase: "作業完了", index: 4 };
  if (work_status === "作業中") return { phase: "作業中", index: 3 };
  if (estimate_status === "了承済")
    return { phase: "ご了承・作業開始", index: 2 };
  if (estimate_status === "発行済") return { phase: "お見積り", index: 1 };
  return { phase: "受注受付", index: 0 };
}
