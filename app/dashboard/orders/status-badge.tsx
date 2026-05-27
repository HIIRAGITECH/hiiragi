import Link from "next/link";
import type {
  EstimateStatus,
  InvoiceStatus,
  WorkStatus,
} from "@/lib/types";

// StatusDropdown のメニュー内ドット用クラス（wos-dot-* で背景色のみ）。
// トリガー側はステータス値に対応する w-u / e-h / i-n 等を付ければ ::before が
// 自動的にドット描画する（globals.css 参照）。
export const workClass: Record<WorkStatus, string> = {
  受付: "w-u wos-dot-grey",
  作業中: "w-s wos-dot-busy",
  完了: "w-k wos-dot-go",
};

export const estimateClass: Record<EstimateStatus, string> = {
  未作成: "e-m wos-dot-grey",
  発行済: "e-h wos-dot-busy",
  了承済: "e-r wos-dot-go",
};

export const invoiceClass: Record<InvoiceStatus, string> = {
  未請求: "i-m wos-dot-grey",
  請求済: "i-s wos-dot-busy",
  入金済: "i-n wos-dot-go",
};

// StatusDropdown に渡す共通のトリガー className（pill 形状を外す）。
export const statusDropdownTriggerClass = "wos-status";

export function WorkStatusBadge({ value }: { value: WorkStatus }) {
  return <span className={`wos-status ${workClass[value].split(" ")[0]}`}>{value}</span>;
}

type EstimateBadgeProps = {
  value: EstimateStatus;
  orderId?: string;
};

export function EstimateStatusBadge({ value, orderId }: EstimateBadgeProps) {
  const cls = `wos-status ${estimateClass[value].split(" ")[0]}`;
  const isLinkable = (value === "発行済" || value === "了承済") && !!orderId;

  if (isLinkable) {
    return (
      <Link
        href={`/dashboard/orders/${orderId}/estimate`}
        aria-label={`見積書を開く: ${orderId}`}
        className={`${cls} cursor-pointer hover:underline`}
      >
        {value}
      </Link>
    );
  }

  return <span className={cls}>{value}</span>;
}

type InvoiceBadgeProps = {
  value: InvoiceStatus;
  orderId?: string;
};

export function InvoiceStatusBadge({ value, orderId }: InvoiceBadgeProps) {
  const cls = `wos-status ${invoiceClass[value].split(" ")[0]}`;
  const isLinkable = (value === "請求済" || value === "入金済") && !!orderId;

  if (isLinkable) {
    return (
      <Link
        href={`/dashboard/orders/${orderId}/invoice`}
        aria-label={`請求書を開く: ${orderId}`}
        className={`${cls} cursor-pointer hover:underline`}
      >
        {value}
      </Link>
    );
  }

  return <span className={cls}>{value}</span>;
}
