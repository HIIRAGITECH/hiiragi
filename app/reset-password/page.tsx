import type { Metadata } from "next";
import Link from "next/link";
import ResetForm from "./reset-form";

export const metadata: Metadata = {
  title: "パスワードリセット | HIIRAGI",
};

export default function ResetPasswordPage() {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-zinc-950">
      <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            パスワードリセット
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            登録メールアドレスにリセット用のリンクを送信します。
          </p>
        </div>

        <ResetForm />

        <p className="mt-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
          <Link
            href="/login"
            className="text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-50"
          >
            ← ログインに戻る
          </Link>
        </p>
      </div>
    </div>
  );
}
