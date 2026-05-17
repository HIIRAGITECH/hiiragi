import { calculateTotals } from "@/lib/orders/totals";
import type { OrderItem } from "@/lib/types";

// 振込期限ステータス。
// - overdue: 期限 < 今日（赤）
// - due_soon: 期限まで 3 日以内（黄）
// - on_track: 期限まで 4 日以上（緑）
// - no_due_date: 振込期限 未設定（グレー）
export type PaymentStatus =
  | "overdue"
  | "due_soon"
  | "on_track"
  | "no_due_date";

export type PaymentClassification = {
  status: PaymentStatus;
  // overdue → 超過日数（正の数）/ due_soon・on_track → 残り日数（正または 0）/ no_due_date → 0
  days: number;
};

// 「今日」を Asia/Tokyo タイムゾーンの YYYY-MM-DD で取得する。
// en-CA ロケールは ISO 形式 YYYY-MM-DD を返す（'2026/05/18' ではなく '2026-05-18'）。
export function getTodayJst(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
  }).format(new Date());
}

// YYYY-MM-DD 同士を UTC エポックに変換して日数差を算出する。
// 同じタイムゾーン基準（00:00Z）で揃えるので DST やオフセットの影響を受けない。
export function diffDaysFromJst(dueDate: string, todayJst: string): number {
  const due = new Date(`${dueDate}T00:00:00Z`).getTime();
  const today = new Date(`${todayJst}T00:00:00Z`).getTime();
  return Math.round((due - today) / (1000 * 60 * 60 * 24));
}

export function classifyPayment(
  dueDate: string | null,
  todayJst: string,
): PaymentClassification {
  if (!dueDate) return { status: "no_due_date", days: 0 };
  const diff = diffDaysFromJst(dueDate, todayJst);
  if (diff < 0) return { status: "overdue", days: -diff };
  if (diff <= 3) return { status: "due_soon", days: diff };
  return { status: "on_track", days: diff };
}

// 顧客への請求残高（税込）。預かり金がある場合は差引請求額、それ以外は税込合計を返す。
// 受注詳細・帳票（printable-document / InvoiceDocument）の「ご請求金額」と同じ計算式。
export function computeOwedAmount(
  items: OrderItem[],
  discountAmount: number,
  depositAmount: number,
): number {
  const totals = calculateTotals(items, discountAmount, depositAmount);
  return totals.deposit > 0 ? totals.balance : totals.total;
}
