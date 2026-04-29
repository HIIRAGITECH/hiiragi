import Link from "next/link";
import type { EstimateStatus, WorkStatus } from "@/lib/types";

const workClass: Record<WorkStatus, string> = {
  受付: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  作業中: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
  完了: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300",
  請求済: "bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300",
};

const estimateClass: Record<EstimateStatus, string> = {
  未作成: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  見積済: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
};

export function WorkStatusBadge({ value }: { value: WorkStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${workClass[value]}`}
    >
      {value}
    </span>
  );
}

// orderId を渡すと「見積済」のとき見積書ページへの Link としてレンダリングする。
// 未指定 or 値が「未作成」のときは従来通り span（クリック不可）。
type EstimateBadgeProps = {
  value: EstimateStatus;
  orderId?: string;
};

export function EstimateStatusBadge({ value, orderId }: EstimateBadgeProps) {
  const baseClass = `inline-block rounded-full px-2 py-0.5 text-xs font-medium ${estimateClass[value]}`;

  if (value === "見積済" && orderId) {
    return (
      <Link
        href={`/dashboard/orders/${orderId}/estimate`}
        aria-label={`見積書を開く: ${orderId}`}
        className={`${baseClass} cursor-pointer hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:focus-visible:outline-emerald-400`}
      >
        {value}
      </Link>
    );
  }

  return <span className={baseClass}>{value}</span>;
}
