import type { Metadata } from "next";
import Link from "next/link";
import SignupForm from "./signup-form";

export const metadata: Metadata = {
  title: "新規登録 | HIIRAGI",
};

export default function SignupPage() {
  return (
    <div className="flex flex-1 items-center justify-center bg-[var(--color-cream)] px-4 py-12">
      <div className="w-full max-w-md bg-[var(--color-paper)] border border-[var(--color-line-strong)] p-10">
        <div className="mb-8 text-center">
          <h1
            className="text-2xl font-bold tracking-widest text-[var(--color-ink)]"
            style={{ letterSpacing: "0.2em" }}
          >
            HIIRAGI <span className="text-[var(--color-accent)]">TECH</span>
          </h1>
          <p className="mt-2 text-xs text-[var(--color-ink-light)] tracking-widest">
            新しいアカウントを作成します
          </p>
        </div>

        <SignupForm />

        <p className="mt-6 text-center text-xs text-[var(--color-ink-light)]">
          すでにアカウントをお持ちの方は{" "}
          <Link
            href="/login"
            className="text-[var(--color-accent)] hover:underline"
          >
            ログイン
          </Link>
        </p>
      </div>
    </div>
  );
}
