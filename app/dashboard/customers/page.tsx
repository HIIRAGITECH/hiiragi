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
      <div className="wos-pagehead">
        <div className="min-w-0 flex-1">
          <div className="wos-crumbs">顧客管理</div>
          <h1>顧客一覧</h1>
          <div className="wos-gloss">
            登録件数 {customers.length} 件。氏名・カナ・電話・メモから検索できます。
          </div>
        </div>
        <div className="wos-actions">
          <Link href="/dashboard/customers/new" className="wos-btn wos-btn-sm">
            ＋ 新規顧客を登録
          </Link>
        </div>
      </div>

      {error && (
        <div className="px-8 pt-4">
          <p className="wos-alert warn">
            顧客一覧の取得に失敗しました: {error.message}
          </p>
        </div>
      )}

      <CustomersTable rows={customers} />
    </>
  );
}
