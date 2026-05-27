"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { WorkItemCategory } from "@/lib/types";
import type { FormState } from "./actions";

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
    <form action={formAction} className="wos-card space-y-5">
      <div>
        <label htmlFor="name" className="wos-label">
          カテゴリ名<span className="wos-req">*</span>
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
          className="wos-input"
        />
        {initial?.is_system && (
          <p className="mt-1 text-xs text-[var(--color-ink-light)]">
            これは標準カテゴリです。名前は変更できますが削除はできません。
          </p>
        )}
      </div>

      {state?.error && (
        <p role="alert" className="wos-alert warn">
          {state.error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <Link href={cancelHref} className="wos-btn-ghost wos-btn-sm">
          キャンセル
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="wos-btn wos-btn-sm"
        >
          {pending ? "保存中…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
