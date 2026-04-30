import Link from "next/link";
import type {
  EstimateStatus,
  InvoiceStatus,
  WorkStatus,
} from "@/lib/types";

export const baseBadgeClass =
  "inline-block rounded-full px-2 py-0.5 text-xs font-medium";

export const workClass: Record<WorkStatus, string> = {
  受付: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  作業中: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
  完了: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300",
};

export const estimateClass: Record<EstimateStatus, string> = {
  未作成: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  発行済: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  了承済: "bg-teal-100 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300",
};

export const invoiceClass: Record<InvoiceStatus, string> = {
  未請求: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  請求済: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  入金済: "bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300",
};

export function WorkStatusBadge({ value }: { value: WorkStatus }) {
  return (
    <span className={`${baseBadgeClass} ${workClass[value]}`}>{value}</span>
  );
}

// orderId を渡すと「発行済」「了承済」のとき見積書ページへの Link としてレンダリングする。
// 「未作成」または orderId 未指定のときは通常の span。
type EstimateBadgeProps = {
  value: EstimateStatus;
  orderId?: string;
};

export function EstimateStatusBadge({ value, orderId }: EstimateBadgeProps) {
  const className = `${baseBadgeClass} ${estimateClass[value]}`;
  const isLinkable = (value === "発行済" || value === "了承済") && !!orderId;

  if (isLinkable) {
    return (
      <Link
        href={`/dashboard/orders/${orderId}/estimate`}
        aria-label={`見積書を開く: ${orderId}`}
        className={`${className} cursor-pointer hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:focus-visible:outline-emerald-400`}
      >
        {value}
      </Link>
    );
  }

  return <span className={className}>{value}</span>;
}

// orderId を渡すと「請求済」「入金済」のとき請求書ページへの Link としてレンダリングする。
type InvoiceBadgeProps = {
  value: InvoiceStatus;
  orderId?: string;
};

export function InvoiceStatusBadge({ value, orderId }: InvoiceBadgeProps) {
  const className = `${baseBadgeClass} ${invoiceClass[value]}`;
  const isLinkable = (value === "請求済" || value === "入金済") && !!orderId;

  if (isLinkable) {
    return (
      <Link
        href={`/dashboard/orders/${orderId}/invoice`}
        aria-label={`請求書を開く: ${orderId}`}
        className={`${className} cursor-pointer hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 dark:focus-visible:outline-amber-400`}
      >
        {value}
      </Link>
    );
  }

  return <span className={className}>{value}</span>;
}
