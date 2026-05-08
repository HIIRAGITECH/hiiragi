import type { Metadata } from "next";
import Link from "next/link";
import WorkItemCategoryForm from "../work-item-category-form";
import { createWorkItemCategory } from "../actions";

export const metadata: Metadata = {
  title: "カテゴリ 新規登録 | HIIRAGI",
};

export default function NewWorkItemCategoryPage() {
  return (
    <>
      <div className="mb-6">
        <Link
          href="/dashboard/work-item-categories"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          ← カテゴリ一覧に戻る
        </Link>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          カテゴリ 新規登録
        </h2>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <WorkItemCategoryForm
          action={createWorkItemCategory}
          submitLabel="登録する"
          cancelHref="/dashboard/work-item-categories"
        />
      </div>
    </>
  );
}
