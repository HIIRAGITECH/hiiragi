"use client";

import { useState } from "react";
import PaymentDueModal, {
  calculateDefaultDueDate,
} from "@/lib/components/payment-due-modal";
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
  invoiceSubject: string | null;
};

export default function OrderStatusBar({
  orderId,
  workStatus,
  estimateStatus,
  invoiceStatus,
  invoiceSubject,
}: Props) {
  const [showPaymentDue, setShowPaymentDue] = useState(false);

  async function applyInvoiced(dueDate: string, subject: string | null) {
    const result = await updateInvoiceStatus(
      orderId,
      "請求済",
      dueDate,
      subject,
    );
    if (
      !result &&
      typeof window !== "undefined" &&
      window.confirm(
        `受注「${orderId}」をアーカイブして一覧から非表示にしますか？`,
      )
    ) {
      await updateArchived(orderId, true);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <StatusRow label="作業">
        <StatusDropdown
          value={workStatus}
          options={WORK_STATUSES}
          classMap={workClass}
          onSelect={(next) => updateWorkStatus(orderId, next)}
          ariaLabel="作業ステータスを変更"
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
          onSelect={async (next) => {
            if (next === "請求済") {
              setShowPaymentDue(true);
            } else {
              await updateInvoiceStatus(orderId, next);
            }
          }}
          ariaLabel="請求ステータスを変更"
        />
      </StatusRow>

      {showPaymentDue && (
        <PaymentDueModal
          orderId={orderId}
          defaultDate={calculateDefaultDueDate(new Date())}
          defaultSubject={invoiceSubject}
          onClose={() => setShowPaymentDue(false)}
          onConfirm={async (date, subject) => {
            setShowPaymentDue(false);
            await applyInvoiced(date, subject);
          }}
        />
      )}
    </div>
  );
}
