"use client";

import { useActionState } from "react";
import { signup, type SignupState } from "./actions";

export default function SignupForm() {
  const [state, formAction, pending] = useActionState<SignupState, FormData>(
    signup,
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

      <div>
        <label htmlFor="password" className="wos-label">
          パスワード
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
          パスワード（確認）
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
        {pending ? "登録中…" : "新規登録"}
      </button>
    </form>
  );
}
