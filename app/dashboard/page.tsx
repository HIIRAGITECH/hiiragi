import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatYen } from "@/lib/format";
import {
  classifyPayment,
  computeOwedAmount,
  getTodayJst,
} from "@/lib/payments/classify";
import type { OrderItem } from "@/lib/types";

export const metadata: Metadata = {
  title: "ダッシュボード | HIIRAGI",
};

type PaymentFetchRow = {
  payment_due_date: string | null;
  items: OrderItem[] | null;
  discount_amount: number | null;
  deposit_amount: number | null;
};

async function fetchPaymentSummary(): Promise<{
  totalCount: number;
  totalAmount: number;
  overdueCount: number;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { totalCount: 0, totalAmount: 0, overdueCount: 0 };

  const { data } = await supabase
    .from("orders")
    .select("payment_due_date, items, discount_amount, deposit_amount")
    .eq("user_id", user.id)
    .eq("invoice_status", "請求済")
    .eq("is_archived", false);

  const rows = (data ?? []) as PaymentFetchRow[];
  const todayJst = getTodayJst();
  let totalCount = 0;
  let totalAmount = 0;
  let overdueCount = 0;
  for (const r of rows) {
    const owed = computeOwedAmount(
      r.items ?? [],
      r.discount_amount ?? 0,
      r.deposit_amount ?? 0,
    );
    totalCount += 1;
    totalAmount += owed;
    if (classifyPayment(r.payment_due_date, todayJst).status === "overdue") {
      overdueCount += 1;
    }
  }
  return { totalCount, totalAmount, overdueCount };
}

const cardClass =
  "group rounded-lg border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600";
const cardTitleClass =
  "text-base font-semibold text-zinc-900 group-hover:text-zinc-700 dark:text-zinc-50 dark:group-hover:text-zinc-200";
const cardDescClass = "mt-1 text-sm text-zinc-500 dark:text-zinc-400";

export default async function DashboardPage() {
  const summary = await fetchPaymentSummary();

  return (
    <>
      <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        ダッシュボード
      </h2>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        各種管理機能にアクセスできます。
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/dashboard/customers" className={cardClass}>
          <h3 className={cardTitleClass}>顧客管理</h3>
          <p className={cardDescClass}>
            顧客と保有車両の一覧・登録・編集を行います。
          </p>
        </Link>
        <Link href="/dashboard/orders" className={cardClass}>
          <h3 className={cardTitleClass}>受注管理</h3>
          <p className={cardDescClass}>
            入庫受付から作業・請求までのステータスを管理します。
          </p>
        </Link>
        <Link href="/dashboard/payments" className={cardClass}>
          <h3 className={cardTitleClass}>入金管理</h3>
          <p className={cardDescClass}>
            請求済の受注について、振込期限と入金状況を管理します。
          </p>
          {summary.totalCount === 0 ? (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
              現在、未回収はありません 🎉
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-sm text-zinc-600 dark:text-zinc-300">
                未回収 {summary.totalCount}件
              </span>
              <span className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                {formatYen(summary.totalAmount)}
              </span>
            </div>
          )}
          {summary.overdueCount > 0 && (
            <span className="mt-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-950/40 dark:text-red-300">
              ⚠️ 期限超過 {summary.overdueCount}件
            </span>
          )}
        </Link>
        <Link href="/dashboard/sales" className={cardClass}>
          <h3 className={cardTitleClass}>売上集計</h3>
          <p className={cardDescClass}>
            請求済の受注を月別に集計し、売上と前受金を確認します。
          </p>
        </Link>
        <Link href="/dashboard/settings" className={cardClass}>
          <h3 className={cardTitleClass}>設定</h3>
          <p className={cardDescClass}>
            店舗情報・ロゴ・電子印鑑・振込先などを編集します。
          </p>
        </Link>
      </div>
    </>
  );
}
