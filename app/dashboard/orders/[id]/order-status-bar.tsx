"use client";

import StatusDropdown from "@/lib/components/status-dropdown";
import StatusRow from "@/lib/components/status-row";
import {
  ESTIMATE_STATUSES,
  INVOICE_STATUSES,
  WORK_STATUSES,
  type EstimateStatus,
  type InvoiceStatus,
  type WorkStatus,
} from "@/lib/types";
import {
  updateEstimateStatus,
  updateInvoiceStatus,
  updateWorkStatus,
} from "../actions";
import {
  estimateClass,
  invoiceClass,
  workClass,
} from "../status-badge";

type Props = {
  orderId: string;
  workStatus: WorkStatus;
  estimateStatus: EstimateStatus;
  invoiceStatus: InvoiceStatus;
};

export default function OrderStatusBar({
  orderId,
  workStatus,
  estimateStatus,
  invoiceStatus,
}: Props) {
  // 請求済化はモーダルなしで即時実行。振込期限・件名は帳票出力ポップアップで設定する。
  // アーカイブは受注詳細の「アーカイブ」ボタンから行う。
  return (
    <div className="flex flex-col gap-1">
      <StatusRow label="作業">
        <StatusDropdown
          value={workStatus}
          options={WORK_STATUSES}
          classMap={workClass}
          onSelect={(next) => updateWorkStatus(orderId, next)}
          ariaLabel="作業ステータスを変更"
          baseClassName="wos-status"
        />
      </StatusRow>
      <StatusRow
        label="見積"
        href={
          estimateStatus === "発行済" || estimateStatus === "了承済"
            ? `/dashboard/orders/${orderId}/estimate`
            : undefined
        }
      >
        <StatusDropdown
          value={estimateStatus}
          options={ESTIMATE_STATUSES}
          classMap={estimateClass}
          onSelect={(next) => updateEstimateStatus(orderId, next)}
          ariaLabel="見積ステータスを変更"
          baseClassName="wos-status"
        />
      </StatusRow>
      <StatusRow
        label="請求"
        href={
          invoiceStatus === "請求済" || invoiceStatus === "入金済"
            ? `/dashboard/orders/${orderId}/invoice`
            : undefined
        }
      >
        <StatusDropdown
          value={invoiceStatus}
          options={INVOICE_STATUSES}
          classMap={invoiceClass}
          onSelect={(next) => updateInvoiceStatus(orderId, next)}
          ariaLabel="請求ステータスを変更"
          baseClassName="wos-status"
        />
      </StatusRow>
    </div>
  );
}
