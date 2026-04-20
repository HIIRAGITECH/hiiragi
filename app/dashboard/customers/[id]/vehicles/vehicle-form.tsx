"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { Vehicle } from "@/lib/types";
import type { FormState } from "../../actions";

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  initial?: Vehicle;
  submitLabel: string;
  cancelHref: string;
};

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-50 dark:focus:ring-zinc-50";

const labelClass =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";

export default function VehicleForm({
  action,
  initial,
  submitLabel,
  cancelHref,
}: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    undefined,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="plate_number" className={labelClass}>
            車両ナンバー
          </label>
          <input
            id="plate_number"
            name="plate_number"
            defaultValue={initial?.plate_number ?? ""}
            placeholder="品川 300 あ 12-34"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="maker" className={labelClass}>
            メーカー
          </label>
          <input
            id="maker"
            name="maker"
            defaultValue={initial?.maker ?? ""}
            placeholder="トヨタ"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="model" className={labelClass}>
            車種
          </label>
          <input
            id="model"
            name="model"
            defaultValue={initial?.model ?? ""}
            placeholder="プリウス"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="model_year" className={labelClass}>
            年式
          </label>
          <input
            id="model_year"
            name="model_year"
            type="number"
            min={1900}
            max={2100}
            defaultValue={initial?.model_year ?? ""}
            placeholder="2020"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="color" className={labelClass}>
            色
          </label>
          <input
            id="color"
            name="color"
            defaultValue={initial?.color ?? ""}
            placeholder="ホワイト"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="vin" className={labelClass}>
            車台番号
          </label>
          <input
            id="vin"
            name="vin"
            defaultValue={initial?.vin ?? ""}
            className={inputClass}
          />
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
    </form>
  );
}
