import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "ダッシュボード | HIIRAGI",
};

export default function DashboardPage() {
  return (
    <>
      <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        ダッシュボード
      </h2>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        各種管理機能にアクセスできます。
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/dashboard/customers"
          className="group rounded-lg border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
        >
          <h3 className="text-base font-semibold text-zinc-900 group-hover:text-zinc-700 dark:text-zinc-50 dark:group-hover:text-zinc-200">
            顧客管理
          </h3>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            顧客と保有車両の一覧・登録・編集を行います。
          </p>
        </Link>
        <Link
          href="/dashboard/orders"
          className="group rounded-lg border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
        >
          <h3 className="text-base font-semibold text-zinc-900 group-hover:text-zinc-700 dark:text-zinc-50 dark:group-hover:text-zinc-200">
            受注管理
          </h3>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            入庫受付から作業・請求までのステータスを管理します。
          </p>
        </Link>
        <Link
          href="/dashboard/sales"
          className="group rounded-lg border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
        >
          <h3 className="text-base font-semibold text-zinc-900 group-hover:text-zinc-700 dark:text-zinc-50 dark:group-hover:text-zinc-200">
            売上集計
          </h3>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            請求済の受注を月別に集計し、売上と前受金を確認します。
          </p>
        </Link>
        <Link
          href="/dashboard/settings"
          className="group rounded-lg border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
        >
          <h3 className="text-base font-semibold text-zinc-900 group-hover:text-zinc-700 dark:text-zinc-50 dark:group-hover:text-zinc-200">
            設定
          </h3>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            店舗情報・ロゴ・電子印鑑・振込先などを編集します。
          </p>
        </Link>
      </div>
    </>
  );
}
