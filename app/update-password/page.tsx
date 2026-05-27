import type { Metadata } from "next";
import UpdateForm from "./update-form";

export const metadata: Metadata = {
  title: "新しいパスワード設定 | HIIRAGI",
};

export default function UpdatePasswordPage() {
  return (
    <div className="flex flex-1 items-center justify-center bg-[var(--color-cream)] px-4 py-12">
      <div className="w-full max-w-md bg-[var(--color-paper)] border border-[var(--color-line-strong)] p-10">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-bold tracking-widest text-[var(--color-ink)]">
            新しいパスワード設定
          </h1>
          <p className="mt-2 text-xs text-[var(--color-ink-light)] tracking-widest">
            新しいパスワードを入力してください。
          </p>
        </div>
        <UpdateForm />
      </div>
    </div>
  );
}
