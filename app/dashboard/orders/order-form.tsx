"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { type Order } from "@/lib/types";
import type { FormState } from "./actions";
import CustomerCombobox from "./customer-combobox";
import VehicleQuickAddModal from "./vehicle-quick-add-modal";

export type CustomerOption = {
  id: string;
  name: string;
  vehicles: { id: string; label: string }[];
};

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  customers: CustomerOption[];
  initial?: Order;
  defaultReceptionDate: string;
  submitLabel: string;
  cancelHref: string;
};

export default function OrderForm({
  action,
  customers,
  initial,
  defaultReceptionDate,
  submitLabel,
  cancelHref,
}: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    undefined,
  );

  // 新規時は未選択（空）から検索で選ばせる。編集時のみ既存顧客を初期選択。
  const initialCustomerId = initial?.customer_id ?? "";
  const initialVehicleId = initial?.vehicle_id ?? "";

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

  return (
    <form action={formAction} className="wos-card space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="customer_id" className="wos-label">
            顧客<span className="wos-req">*</span>
          </label>
          <CustomerCombobox
            customers={customers}
            value={customerId}
            onChange={handleCustomerChange}
            inputId="customer_id"
            required
          />
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
            defaultValue={initial?.notes ?? ""}
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
