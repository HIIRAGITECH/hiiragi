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
      <div className="wos-pagehead">
        <div className="min-w-0 flex-1">
          <div className="wos-crumbs">
            <Link href="/dashboard/customers" className="hover:underline">
              顧客管理
            </Link>{" "}
            ／ 新規登録
          </div>
          <h1>顧客を新規登録</h1>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[var(--color-cream)]">
        <div className="px-4 sm:px-8 py-6 max-w-3xl">
          <CustomerForm
            action={createCustomer}
            submitLabel="登録する"
            cancelHref="/dashboard/customers"
          />
        </div>
      </div>
    </>
  );
}
