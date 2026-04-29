"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  ESTIMATE_STATUSES,
  WORK_STATUSES,
  type Order,
} from "@/lib/types";
import type { FormState } from "./actions";
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
  defaultReceptionDate: string; // YYYY-MM-DD
  submitLabel: string;
  cancelHref: string;
};

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-50 dark:focus:ring-zinc-50";

const labelClass =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";

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

  const initialCustomerId = initial?.customer_id ?? customers[0]?.id ?? "";
  const initialVehicleId = initial?.vehicle_id ?? "";

  const [customerId, setCustomerId] = useState(initialCustomerId);
  const [vehicleId, setVehicleId] = useState(initialVehicleId);
  // モーダルから追加された車両をローカルで保持（顧客ID毎）
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
    // 顧客が変わったら車両選択はリセット（以前の車両は別顧客所属なので）
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
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="customer_id" className={labelClass}>
            顧客 <span className="text-red-600">*</span>
          </label>
          <select
            id="customer_id"
            name="customer_id"
            required
            value={customerId}
            onChange={(e) => handleCustomerChange(e.target.value)}
            className={inputClass}
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}（{c.id}）
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="vehicle_id" className={labelClass}>
            車両
          </label>
          <div className="flex gap-2">
            <select
              id="vehicle_id"
              name="vehicle_id"
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              className={inputClass}
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
                customerId ? "この顧客に車両を新規登録" : "先に顧客を選択してください"
              }
              className="shrink-0 rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              ＋ 新規
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="reception_date" className={labelClass}>
            受付日 <span className="text-red-600">*</span>
          </label>
          <input
            id="reception_date"
            name="reception_date"
            type="date"
            required
            defaultValue={initial?.reception_date ?? defaultReceptionDate}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="work_status" className={labelClass}>
            作業ステータス <span className="text-red-600">*</span>
          </label>
          <select
            id="work_status"
            name="work_status"
            required
            defaultValue={initial?.work_status ?? WORK_STATUSES[0]}
            className={inputClass}
          >
            {WORK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="estimate_status" className={labelClass}>
            見積ステータス <span className="text-red-600">*</span>
          </label>
          <select
            id="estimate_status"
            name="estimate_status"
            required
            defaultValue={initial?.estimate_status ?? ESTIMATE_STATUSES[0]}
            className={inputClass}
          >
            {ESTIMATE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="notes" className={labelClass}>
            メモ
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            defaultValue={initial?.notes ?? ""}
            className={inputClass}
          />
        </div>
      </div>

      {state?.error && (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {state.error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <Link
          href={cancelHref}
          className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          キャンセル
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
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
