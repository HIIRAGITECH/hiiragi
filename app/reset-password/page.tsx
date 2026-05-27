import type { Metadata } from "next";
import Link from "next/link";
import ResetForm from "./reset-form";

export const metadata: Metadata = {
  title: "パスワードリセット | HIIRAGI",
};

export default function ResetPasswordPage() {
  return (
    <div className="flex flex-1 items-center justify-center bg-[var(--color-cream)] px-4 py-12">
      <div className="w-full max-w-md bg-[var(--color-paper)] border border-[var(--color-line-strong)] p-10">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-bold tracking-widest text-[var(--color-ink)]">
            パスワードリセット
          </h1>
          <p className="mt-2 text-xs text-[var(--color-ink-light)] tracking-widest">
            登録メールアドレスにリセット用のリンクを送信します。
          </p>
        </div>

        <ResetForm />

        <p className="mt-6 text-center text-xs text-[var(--color-ink-light)]">
          <Link
            href="/login"
            className="text-[var(--color-accent)] hover:underline"
          >
            ← ログインに戻る
          </Link>
        </p>
      </div>
    </div>
  );
}
