import type { Metadata } from "next";
import Link from "next/link";
import CustomerForm from "../customer-form";
import { createCustomer } from "../actions";

export const metadata: Metadata = {
  title: "顧客 新規登録 | HIIRAGI",
};

export default function NewCustomerPage() {
  return (
    <>
      <div className="mb-6">
        <Link
          href="/dashboard/customers"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          ← 顧客一覧に戻る
        </Link>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          顧客 新規登録
        </h2>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <CustomerForm
          action={createCustomer}
          submitLabel="登録する"
          cancelHref="/dashboard/customers"
        />
      </div>
    </>
  );
}
