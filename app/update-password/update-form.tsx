"use client";

import { useActionState } from "react";
import { updatePassword, type UpdatePasswordState } from "./actions";

export default function UpdateForm() {
  const [state, formAction, pending] = useActionState<
    UpdatePasswordState,
    FormData
  >(updatePassword, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="password" className="wos-label">
          新しいパスワード
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          className="wos-input"
        />
        <p className="mt-1 text-xs text-[var(--color-ink-light)]">6文字以上</p>
      </div>

      <div>
        <label htmlFor="password_confirm" className="wos-label">
          新しいパスワード（確認）
        </label>
        <input
          id="password_confirm"
          name="password_confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          className="wos-input"
        />
      </div>

      {state?.error && (
        <p role="alert" className="wos-alert warn">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="wos-btn w-full">
        {pending ? "更新中…" : "パスワードを更新"}
      </button>
    </form>
  );
}
