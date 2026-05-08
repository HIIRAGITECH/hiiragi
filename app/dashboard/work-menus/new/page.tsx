import type { Metadata } from "next";
import Link from "next/link";
import WorkMenuForm from "../work-menu-form";
import { createWorkMenu } from "../actions";

export const metadata: Metadata = {
  title: "作業メニュー 新規登録 | HIIRAGI",
};

export default function NewWorkMenuPage() {
  return (
    <>
      <div className="mb-6">
        <Link
          href="/dashboard/work-menus"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          ← 作業メニュー一覧に戻る
        </Link>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          作業メニュー 新規登録
        </h2>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <WorkMenuForm
          action={createWorkMenu}
          submitLabel="登録する"
          cancelHref="/dashboard/work-menus"
        />
      </div>
    </>
  );
}
