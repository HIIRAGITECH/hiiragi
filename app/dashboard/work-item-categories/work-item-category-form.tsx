"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { WorkItemCategory } from "@/lib/types";
import type { FormState } from "./actions";

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-50 dark:focus:ring-zinc-50";

const labelClass =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  initial?: WorkItemCategory;
  submitLabel: string;
  cancelHref: string;
};

export default function WorkItemCategoryForm({
  action,
  initial,
  submitLabel,
  cancelHref,
}: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    undefined,
  );
  const [name, setName] = useState(initial?.name ?? "");

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="name" className={labelClass}>
          カテゴリ名 <span className="text-red-600">*</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          maxLength={50}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例: オーバーホール"
          className={inputClass}
        />
        {initial?.is_system && (
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            これは標準カテゴリです。名前は変更できますが削除はできません。
          </p>
        )}
      </div>

      {state?.error && (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {state.error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
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
