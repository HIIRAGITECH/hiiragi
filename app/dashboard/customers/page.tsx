import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Customer } from "@/lib/types";

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
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            顧客一覧
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            登録件数: {customers.length} 件
          </p>
        </div>
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

      <div className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        {customers.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
            顧客が登録されていません。
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wider text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-medium">顧客ID</th>
                <th className="px-4 py-3 font-medium">氏名</th>
                <th className="px-4 py-3 font-medium">フリガナ</th>
                <th className="px-4 py-3 font-medium">電話番号</th>
                <th className="px-4 py-3 font-medium">メール</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {customers.map((c) => (
                <tr
                  key={c.id}
                  className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                >
                  <td className="px-4 py-3 font-mono text-xs text-zinc-700 dark:text-zinc-300">
                    <Link
                      href={`/dashboard/customers/${c.id}`}
                      className="text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-50"
                    >
                      {c.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-900 dark:text-zinc-50">
                    <Link
                      href={`/dashboard/customers/${c.id}`}
                      className="hover:underline"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {c.name_kana ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {c.phone ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {c.email ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
