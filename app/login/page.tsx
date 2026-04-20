import type { Metadata } from "next";
import LoginForm from "./login-form";

export const metadata: Metadata = {
  title: "ログイン | HIIRAGI",
};

export default function LoginPage() {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-zinc-950">
      <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            HIIRAGI
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            自動車整備工場 業務管理システム
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
