"use client";

import StatusDropdown from "@/lib/components/status-dropdown";
import {
  ESTIMATE_STATUSES,
  INVOICE_STATUSES,
  WORK_STATUSES,
  type EstimateStatus,
  type InvoiceStatus,
  type WorkStatus,
} from "@/lib/types";
import {
  updateArchived,
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
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusDropdown
        value={workStatus}
        options={WORK_STATUSES}
        classMap={workClass}
        onSelect={(next) => updateWorkStatus(orderId, next)}
        ariaLabel="作業ステータスを変更"
      />
      <StatusDropdown
        value={estimateStatus}
        options={ESTIMATE_STATUSES}
        classMap={estimateClass}
        onSelect={(next) => updateEstimateStatus(orderId, next)}
        ariaLabel="見積ステータスを変更"
      />
      <StatusDropdown
        value={invoiceStatus}
        options={INVOICE_STATUSES}
        classMap={invoiceClass}
        onSelect={async (next) => {
          const result = await updateInvoiceStatus(orderId, next);
          if (
            !result &&
            next === "請求済" &&
            typeof window !== "undefined" &&
            window.confirm(
              `受注「${orderId}」をアーカイブして一覧から非表示にしますか？`,
            )
          ) {
            await updateArchived(orderId, true);
          }
        }}
        confirmOn={{
          value: "請求済",
          message:
            "「請求済」にすると売上計上の対象になります。よろしいですか？",
        }}
        ariaLabel="請求ステータスを変更"
      />
    </div>
  );
}
