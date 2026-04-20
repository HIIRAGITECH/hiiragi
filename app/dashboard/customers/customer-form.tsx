"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { Customer } from "@/lib/types";
import type { FormState } from "./actions";

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  initial?: Customer;
  submitLabel: string;
  cancelHref: string;
};

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-50 dark:focus:ring-zinc-50";

const labelClass =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";

export default function CustomerForm({
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
          <label htmlFor="name" className={labelClass}>
            氏名 <span className="text-red-600">*</span>
          </label>
          <input
            id="name"
            name="name"
            required
            defaultValue={initial?.name ?? ""}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="name_kana" className={labelClass}>
            フリガナ
          </label>
          <input
            id="name_kana"
            name="name_kana"
            defaultValue={initial?.name_kana ?? ""}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="phone" className={labelClass}>
            電話番号
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={initial?.phone ?? ""}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="email" className={labelClass}>
            メールアドレス
          </label>
          <input
            id="email"
            name="email"
            type="email"
            defaultValue={initial?.email ?? ""}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="postal_code" className={labelClass}>
            郵便番号
          </label>
          <input
            id="postal_code"
            name="postal_code"
            defaultValue={initial?.postal_code ?? ""}
            placeholder="123-4567"
            className={inputClass}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="address" className={labelClass}>
            住所
          </label>
          <input
            id="address"
            name="address"
            defaultValue={initial?.address ?? ""}
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
