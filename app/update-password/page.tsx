import type { Metadata } from "next";
import UpdateForm from "./update-form";

export const metadata: Metadata = {
  title: "新しいパスワード設定 | HIIRAGI",
};

export default function UpdatePasswordPage() {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-zinc-950">
      <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            新しいパスワード設定
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            新しいパスワードを入力してください。
          </p>
        </div>
        <UpdateForm />
      </div>
    </div>
  );
}
