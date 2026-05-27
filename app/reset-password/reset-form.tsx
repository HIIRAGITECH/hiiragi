"use client";

import { useActionState } from "react";
import { requestReset, type ResetState } from "./actions";

export default function ResetForm() {
  const [state, formAction, pending] = useActionState<ResetState, FormData>(
    requestReset,
    undefined,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="email" className="wos-label">
          メールアドレス
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="wos-input"
          placeholder="you@example.com"
        />
      </div>

      {state?.error && (
        <p role="alert" className="wos-alert warn">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="wos-btn w-full">
        {pending ? "送信中…" : "リセットメールを送信"}
      </button>
    </form>
  );
}
