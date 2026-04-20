import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Customer } from "@/lib/types";
import CustomerForm from "../../customer-form";
import { updateCustomer } from "../../actions";

export const metadata: Metadata = {
  title: "顧客 編集 | HIIRAGI",
};

export default async function EditCustomerPage(
  props: PageProps<"/dashboard/customers/[id]/edit">,
) {
  const { id } = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .eq("user_id", user!.id)
    .maybeSingle();

  if (!data) notFound();
  const customer = data as Customer;

  const action = updateCustomer.bind(null, customer.id);

  return (
    <>
      <div className="mb-6">
        <Link
          href={`/dashboard/customers/${customer.id}`}
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          ← 顧客詳細に戻る
        </Link>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          顧客 編集（{customer.id}）
        </h2>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <CustomerForm
          action={action}
          initial={customer}
          submitLabel="更新する"
          cancelHref={`/dashboard/customers/${customer.id}`}
        />
      </div>
    </>
  );
}
