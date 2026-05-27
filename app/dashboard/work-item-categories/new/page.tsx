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
      <div className="wos-pagehead">
        <div className="min-w-0 flex-1">
          <div className="wos-crumbs">
            <Link
              href="/dashboard/work-item-categories"
              className="hover:underline"
            >
              カテゴリ管理
            </Link>{" "}
            ／ 新規登録
          </div>
          <h1>業務カテゴリを新規登録</h1>
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-[var(--color-cream)]">
        <div className="px-8 py-6 max-w-xl">
          <WorkItemCategoryForm
            action={createWorkItemCategory}
            submitLabel="登録する"
            cancelHref="/dashboard/work-item-categories"
          />
        </div>
      </div>
    </>
  );
}
