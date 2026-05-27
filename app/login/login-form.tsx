"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export default function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    login,
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
          autoComplete="current-password"
          required
          className="wos-input"
        />
      </div>

      {state?.error && (
        <p role="alert" className="wos-alert warn">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="wos-btn w-full">
        {pending ? "ログイン中…" : "ログイン"}
      </button>
    </form>
  );
}
