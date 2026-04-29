import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Customer } from "@/lib/types";
import CustomersTable from "./customers-table";

export const metadata: Metadata = {
  title: "顧客一覧 | HIIRAGI",
};

export default async function CustomersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("user_id", user!.id)
    .order("id", { ascending: true });

  const customers = (data ?? []) as Customer[];

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          顧客一覧
        </h2>
        <Link
          href="/dashboard/customers/new"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          ＋ 新規登録
        </Link>
      </div>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          顧客一覧の取得に失敗しました: {error.message}
        </p>
      )}

      <div className="mt-4">
        <CustomersTable rows={customers} />
      </div>
    </>
  );
}
