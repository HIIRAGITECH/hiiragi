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
    <form action={formAction} className="wos-card space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="wos-label">
            氏名<span className="wos-req">*</span>
          </label>
          <input
            id="name"
            name="name"
            required
            defaultValue={initial?.name ?? ""}
            className="wos-input"
          />
        </div>
        <div>
          <label htmlFor="name_kana" className="wos-label">
            フリガナ
          </label>
          <input
            id="name_kana"
            name="name_kana"
            defaultValue={initial?.name_kana ?? ""}
            className="wos-input"
          />
        </div>
        <div>
          <label htmlFor="phone" className="wos-label">
            電話番号
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={initial?.phone ?? ""}
            className="wos-input"
          />
        </div>
        <div>
          <label htmlFor="email" className="wos-label">
            メールアドレス
          </label>
          <input
            id="email"
            name="email"
            type="email"
            defaultValue={initial?.email ?? ""}
            className="wos-input"
          />
        </div>
        <div>
          <label htmlFor="postal_code" className="wos-label">
            郵便番号
          </label>
          <input
            id="postal_code"
            name="postal_code"
            defaultValue={initial?.postal_code ?? ""}
            placeholder="123-4567"
            className="wos-input"
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="address" className="wos-label">
            住所
          </label>
          <input
            id="address"
            name="address"
            defaultValue={initial?.address ?? ""}
            className="wos-input"
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="notes" className="wos-label">
            メモ
          </label>
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
    </form>
  );
}
