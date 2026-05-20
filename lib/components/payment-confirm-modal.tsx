"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  orderId: string;
  defaultDate: string; // YYYY-MM-DD（通常は今日 JST）
  onConfirm: (paidAt: string) => void | Promise<void>;
  onClose: () => void;
};

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-50 dark:focus:ring-zinc-50";

const labelClass =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";

// 入金確認モーダル。
// 過去日の入金記録も可能（実際に入金された日を入力できる）。
// 確定すると onConfirm(paidAt) が呼ばれる。呼び出し側で
// updateInvoiceStatus(id, '入金済', undefined, undefined, paidAt) を実行する。
export default function PaymentConfirmModal({
  orderId,
  defaultDate,
  onConfirm,
  onClose,
}: Props) {
  const [date, setDate] = useState(defaultDate);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleConfirm() {
    if (!date) return;
    setPending(true);
    try {
      await onConfirm(date);
    } finally {
      setPending(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-confirm-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4">
          <h3
            id="payment-confirm-modal-title"
            className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
          >
            入金確認
          </h3>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            受注「{orderId}」を「入金済」に変更します。実際の入金日を入力してください。
          </p>
        </div>

        <div>
          <label htmlFor="paid_at" className={labelClass}>
            入金日
          </label>
          <input
            ref={inputRef}
            id="paid_at"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={pending}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            初期値は本日です。過去の入金日も入力できます。
          </p>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={pending || !date}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {pending ? "保存中..." : "確定して入金済へ"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
