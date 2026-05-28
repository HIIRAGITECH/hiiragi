"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { formatYen } from "@/lib/format";
import { type Order } from "@/lib/types";
import type { FormState } from "./actions";
import VehicleQuickAddModal from "./vehicle-quick-add-modal";

export type CustomerOption = {
  id: string;
  name: string;
  vehicles: { id: string; label: string }[];
};

// 受注「複製」モードで OrderForm に渡すプレビュー情報。
// sourceId は hidden input として送信され、createOrder 側で再フェッチして
// items / discount_amount を新規行にコピーする（クライアントから JSON を送らないので改ざんに強い）。
export type DuplicateContext = {
  sourceId: string;
  itemsPreview: { work_name: string; quantity: number }[];
  discountAmount: number;
};

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  customers: CustomerOption[];
  initial?: Order;
  defaultReceptionDate: string;
  // 複製モードで notes 初期値を渡す。initial と排他で使う。
  defaultNotes?: string | null;
  submitLabel: string;
  cancelHref: string;
  // 複製モード: 顧客・車両を空に強制し、プレビュー＋hidden duplicate_from を出す。
  duplicate?: DuplicateContext;
};

export default function OrderForm({
  action,
  customers,
  initial,
  defaultReceptionDate,
  defaultNotes,
  submitLabel,
  cancelHref,
  duplicate,
}: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    undefined,
  );

  const initialCustomerId = duplicate
    ? ""
    : (initial?.customer_id ?? customers[0]?.id ?? "");
  const initialVehicleId = duplicate ? "" : (initial?.vehicle_id ?? "");

  const [customerId, setCustomerId] = useState(initialCustomerId);
  const [vehicleId, setVehicleId] = useState(initialVehicleId);
  const [extraVehicles, setExtraVehicles] = useState<
    Record<string, { id: string; label: string }[]>
  >({});
  const [modalOpen, setModalOpen] = useState(false);

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const baseVehicles = selectedCustomer?.vehicles ?? [];
  const extra = extraVehicles[customerId] ?? [];
  const vehicles = [...baseVehicles, ...extra];

  function handleCustomerChange(newId: string) {
    setCustomerId(newId);
    setVehicleId("");
  }

  function handleVehicleAdded(v: { id: string; label: string }) {
    setExtraVehicles((prev) => ({
      ...prev,
      [customerId]: [...(prev[customerId] ?? []), v],
    }));
    setVehicleId(v.id);
  }

  const previewItems = duplicate?.itemsPreview ?? [];
  const previewHead = previewItems.slice(0, 5);
  const previewRest = previewItems.length - previewHead.length;

  return (
    <form action={formAction} className="wos-card space-y-5">
      {duplicate && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          <div className="font-semibold mb-1">
            📋 受注「{duplicate.sourceId}」から複製
          </div>
          <div className="text-xs leading-relaxed">
            明細 {previewItems.length} 件・値引き {formatYen(duplicate.discountAmount)}・入荷時メモを引き継ぎます。
            お客様・車両を選択して「保存」すると、新しい管理番号で登録されます。
          </div>
          {previewItems.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-amber-800 dark:text-amber-300">
              {previewHead.map((it, i) => (
                <li key={i}>
                  {it.work_name}
                  <span className="text-amber-600 dark:text-amber-400/80">
                    {" "}× {it.quantity}
                  </span>
                </li>
              ))}
              {previewRest > 0 && <li>…他 {previewRest} 件</li>}
            </ul>
          )}
          <input
            type="hidden"
            name="duplicate_from"
            value={duplicate.sourceId}
          />
        </div>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="customer_id" className="wos-label">
            顧客<span className="wos-req">*</span>
          </label>
          <select
            id="customer_id"
            name="customer_id"
            required
            value={customerId}
            onChange={(e) => handleCustomerChange(e.target.value)}
            className="wos-select"
          >
            {customerId === "" && (
              <option value="" disabled>
                （顧客を選択してください）
              </option>
            )}
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="vehicle_id" className="wos-label">
            車両
          </label>
          <div className="flex gap-2">
            <select
              id="vehicle_id"
              name="vehicle_id"
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              className="wos-select"
            >
              <option value="">
                {vehicles.length === 0
                  ? "（この顧客には車両が登録されていません）"
                  : "（未選択）"}
              </option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              disabled={!customerId}
              title={
                customerId
                  ? "この顧客に車両を新規登録"
                  : "先に顧客を選択してください"
              }
              className="wos-btn-ghost wos-btn-xs shrink-0"
            >
              ＋ 新規
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="reception_date" className="wos-label">
            受付日<span className="wos-req">*</span>
          </label>
          <input
            id="reception_date"
            name="reception_date"
            type="date"
            required
            defaultValue={initial?.reception_date ?? defaultReceptionDate}
            className="wos-input"
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="notes" className="wos-label">
            入荷時メモ
          </label>
          <p className="text-xs text-[var(--color-ink-light)] mb-2">
            受注一覧画面で確認するための社内向けメモ。見積書・請求書には出ません。
          </p>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            defaultValue={defaultNotes ?? initial?.notes ?? ""}
            className="wos-textarea"
          />
        </div>
      </div>

      {state?.error && (
        <p role="alert" className="wos-alert warn">
          {state.error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <Link href={cancelHref} className="wos-btn-ghost wos-btn-sm">
          キャンセル
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="wos-btn wos-btn-sm"
        >
          {pending ? "保存中..." : submitLabel}
        </button>
      </div>

      {modalOpen && (
        <VehicleQuickAddModal
          customerId={customerId}
          customerName={selectedCustomer?.name ?? ""}
          onClose={() => setModalOpen(false)}
          onAdded={handleVehicleAdded}
        />
      )}
    </form>
  );
}
