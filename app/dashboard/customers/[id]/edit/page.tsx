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
      <div className="wos-pagehead">
        <div className="min-w-0 flex-1">
          <div className="wos-crumbs">
            <Link href="/dashboard/customers" className="hover:underline">
              顧客管理
            </Link>{" "}
            ／{" "}
            <Link
              href={`/dashboard/customers/${customer.id}`}
              className="hover:underline"
            >
              {customer.name}
            </Link>{" "}
            ／ 編集
          </div>
          <h1>顧客情報を編集</h1>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[var(--color-cream)]">
        <div className="px-4 sm:px-8 py-6 max-w-3xl">
          <CustomerForm
            action={action}
            initial={customer}
            submitLabel="更新する"
            cancelHref={`/dashboard/customers/${customer.id}`}
          />
        </div>
      </div>
    </>
  );
}
