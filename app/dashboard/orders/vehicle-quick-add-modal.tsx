"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createVehicleInline } from "../customers/actions";

type Props = {
  customerId: string;
  customerName: string;
  onClose: () => void;
  onAdded: (vehicle: { id: string; label: string }) => void;
};

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-50 dark:focus:ring-zinc-50";

const labelClass =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";

function trimOrNull(v: string): string | null {
  const t = v.trim();
  return t === "" ? null : t;
}

export default function VehicleQuickAddModal({
  customerId,
  customerName,
  onClose,
  onAdded,
}: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const [plate, setPlate] = useState("");
  const [maker, setMaker] = useState("");
  const [model, setModel] = useState("");
  const [modelYear, setModelYear] = useState("");
  const [color, setColor] = useState("");
  const [vin, setVin] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    firstFieldRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit() {
    setPending(true);
    setError(null);
    const yearNum =
      modelYear.trim() === "" ? null : Number.parseInt(modelYear, 10);
    if (yearNum !== null && !Number.isFinite(yearNum)) {
      setError("年式は数値で入力してください。");
      setPending(false);
      return;
    }
    const result = await createVehicleInline(customerId, {
      plate_number: trimOrNull(plate),
      maker: trimOrNull(maker),
      model: trimOrNull(model),
      model_year: yearNum,
      color: trimOrNull(color),
      vin: trimOrNull(vin),
      notes: trimOrNull(notes),
    });
    setPending(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onAdded(result.vehicle);
    onClose();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="vehicle-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4">
          <h3
            id="vehicle-modal-title"
            className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
          >
            車両を新規登録
          </h3>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            顧客: {customerName}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="qa_plate" className={labelClass}>
              車両ナンバー
            </label>
            <input
              ref={firstFieldRef}
              id="qa_plate"
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
              placeholder="品川 300 あ 12-34"
              className={inputClass}
              disabled={pending}
            />
          </div>
          <div>
            <label htmlFor="qa_maker" className={labelClass}>
              メーカー
            </label>
            <input
              id="qa_maker"
              value={maker}
              onChange={(e) => setMaker(e.target.value)}
              placeholder="トヨタ"
              className={inputClass}
              disabled={pending}
            />
          </div>
          <div>
            <label htmlFor="qa_model" className={labelClass}>
              車種
            </label>
            <input
              id="qa_model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="プリウス"
              className={inputClass}
              disabled={pending}
            />
          </div>
          <div>
            <label htmlFor="qa_year" className={labelClass}>
              年式
            </label>
            <input
              id="qa_year"
              type="number"
              min={1900}
              max={2100}
              value={modelYear}
              onChange={(e) => setModelYear(e.target.value)}
              placeholder="2020"
              className={inputClass}
              disabled={pending}
            />
          </div>
          <div>
            <label htmlFor="qa_color" className={labelClass}>
              色
            </label>
            <input
              id="qa_color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="ホワイト"
              className={inputClass}
              disabled={pending}
            />
          </div>
          <div>
            <label htmlFor="qa_vin" className={labelClass}>
              車台番号
            </label>
            <input
              id="qa_vin"
              value={vin}
              onChange={(e) => setVin(e.target.value)}
              className={inputClass}
              disabled={pending}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="qa_notes" className={labelClass}>
              メモ
            </label>
            <textarea
              id="qa_notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={inputClass}
              disabled={pending}
            />
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
          >
            {error}
          </p>
        )}

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
            onClick={submit}
            disabled={pending}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {pending ? "登録中..." : "登録する"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
