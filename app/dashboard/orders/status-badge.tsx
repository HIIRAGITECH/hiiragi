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

export function EstimateStatusBadge({ value }: { value: EstimateStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${estimateClass[value]}`}
    >
      {value}
    </span>
  );
}
