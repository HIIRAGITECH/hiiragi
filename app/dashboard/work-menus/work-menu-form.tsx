"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { WorkCategory, WorkMenuItem } from "@/lib/types";
import type { FormState } from "./actions";

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  initial?: WorkMenuItem;
  submitLabel: string;
  cancelHref: string;
};

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-50 dark:focus:ring-zinc-50";

const labelClass =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";

const CATEGORY_OPTIONS: { value: WorkCategory; label: string }[] = [
  { value: "normal", label: "整備" },
  { value: "shaken", label: "車検（課税）" },
  { value: "shaken_tax_free", label: "車検（非課税）" },
];

export default function WorkMenuForm({
  action,
  initial,
  submitLabel,
  cancelHref,
}: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    undefined,
  );
  const [category, setCategory] = useState<WorkCategory>(
    initial?.category ?? "normal",
  );
  const [taxFree, setTaxFree] = useState<boolean>(initial?.tax_free ?? false);

  const taxFreeForced = category === "shaken_tax_free";
  const taxFreeChecked = taxFreeForced ? true : taxFree;

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="work_name" className={labelClass}>
          作業内容 <span className="text-red-600">*</span>
        </label>
        <input
          id="work_name"
          name="work_name"
          required
          defaultValue={initial?.work_name ?? ""}
          className={inputClass}
          placeholder="例: エンジンオイル交換"
        />
      </div>

      <div>
        <label htmlFor="part_name" className={labelClass}>
          部品名 <span className="text-xs text-zinc-500">（任意）</span>
        </label>
        <input
          id="part_name"
          name="part_name"
          defaultValue={initial?.part_name ?? ""}
          className={inputClass}
          placeholder="例: モチュール 300V 5W-40 4L"
        />
      </div>

      <div>
        <span className={labelClass}>
          カテゴリ <span className="text-red-600">*</span>
        </span>
        <div className="flex flex-wrap gap-3">
          {CATEGORY_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="flex cursor-pointer items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              <input
                type="radio"
                name="category"
                value={opt.value}
                checked={category === opt.value}
                onChange={() => {
                  setCategory(opt.value);
                  if (opt.value === "shaken_tax_free") setTaxFree(true);
                }}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="default_quantity" className={labelClass}>
            数量デフォルト
          </label>
          <input
            id="default_quantity"
            name="default_quantity"
            type="number"
            min={0}
            step="0.1"
            defaultValue={initial?.default_quantity ?? 1}
            className={`${inputClass} text-right`}
          />
        </div>
        <div>
          <label htmlFor="default_unit_price" className={labelClass}>
            単価デフォルト
          </label>
          <input
            id="default_unit_price"
            name="default_unit_price"
            type="number"
            min={0}
            step={1}
            defaultValue={initial?.default_unit_price ?? 0}
            className={`${inputClass} text-right`}
          />
        </div>
        <div>
          <label htmlFor="default_labor_cost" className={labelClass}>
            工賃デフォルト
          </label>
          <input
            id="default_labor_cost"
            name="default_labor_cost"
            type="number"
            min={0}
            step={1}
            defaultValue={initial?.default_labor_cost ?? 0}
            className={`${inputClass} text-right`}
          />
        </div>
        <div>
          <label htmlFor="default_parts_cost" className={labelClass}>
            部品代デフォルト
          </label>
          <input
            id="default_parts_cost"
            name="default_parts_cost"
            type="number"
            min={0}
            step={1}
            defaultValue={initial?.default_parts_cost ?? 0}
            className={`${inputClass} text-right`}
          />
        </div>
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            name="tax_free"
            checked={taxFreeChecked}
            disabled={taxFreeForced}
            onChange={(e) => setTaxFree(e.target.checked)}
          />
          <span>非課税フラグ</span>
          {taxFreeForced && (
            <span className="text-xs text-zinc-500">
              （車検（非課税）カテゴリは自動的に非課税）
            </span>
          )}
        </label>
      </div>

      <div>
        <label htmlFor="memo" className={labelClass}>
          メモ <span className="text-xs text-zinc-500">（任意）</span>
        </label>
        <textarea
          id="memo"
          name="memo"
          rows={3}
          defaultValue={initial?.memo ?? ""}
          className={inputClass}
        />
      </div>

      {state?.error && (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {pending ? "保存中..." : submitLabel}
        </button>
        <Link
          href={cancelHref}
          className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          キャンセル
        </Link>
      </div>
    </form>
  );
}
