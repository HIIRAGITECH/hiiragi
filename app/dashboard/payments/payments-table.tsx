"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import SearchInput from "@/lib/components/search-input";
import { formatYen } from "@/lib/format";
import type { PaymentStatus } from "@/lib/payments/classify";
import { updateInvoiceStatus } from "@/app/dashboard/orders/actions";

export type PaymentRow = {
  id: string;
  invoiced_at: string | null;
  payment_due_date: string | null;
  customer_name: string | null;
  customer_id: string | null;
  owed_amount: number;
  status: PaymentStatus;
  // overdue → 超過日数、due_soon/on_track → 残り日数、no_due_date → 0
  days: number;
};

type Props = {
  rows: PaymentRow[];
};

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFKC");
}

function buildHaystack(r: PaymentRow): string {
  return normalize(
    [r.id, r.customer_name, r.payment_due_date, r.invoiced_at]
      .filter(Boolean)
      .join(" "),
  );
}

function formatDateOnly(iso: string | null): string {
  if (!iso) return "—";
  return iso.slice(0, 10).replace(/-/g, "/");
}

function formatDueDate(s: string | null): string {
  if (!s) return "—";
  return s.replace(/-/g, "/");
}

// 状態バッジ。色とテキストを一箇所にまとめておく。
function StatusBadge({
  status,
  days,
}: {
  status: PaymentStatus;
  days: number;
}) {
  if (status === "overdue") {
    return (
      <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-950/40 dark:text-red-300">
        ⚠️ {days}日超過
      </span>
    );
  }
  if (status === "due_soon") {
    return (
      <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
        残り {days}日
      </span>
    );
  }
  if (status === "on_track") {
    return (
      <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-950/40 dark:text-green-300">
        期限内
      </span>
    );
  }
  return (
    <span className="inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
      期限未設定
    </span>
  );
}

export default function PaymentsTable({ rows }: Props) {
  const [query, setQuery] = useState("");
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return rows;
    const needle = normalize(q);
    return rows.filter((r) => buildHaystack(r).includes(needle));
  }, [rows, query]);

  const isSearching = query.trim().length > 0;

  async function handleMarkPaid(id: string) {
    if (
      typeof window !== "undefined" &&
      !window.confirm(`受注「${id}」を入金済に変更しますか？`)
    ) {
      return;
    }
    setPendingId(id);
    try {
      const result = await updateInvoiceStatus(id, "入金済");
      if (result?.error) {
        window.alert(result.error);
        return;
      }
      // updateInvoiceStatus 内で revalidatePath されるが、明示的に router.refresh して
      // 行が消えることを即座に画面に反映する。
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  return (
    <>
      <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {isSearching
            ? `${rows.length} 件中 ${filtered.length} 件表示`
            : `未回収: ${rows.length} 件`}
        </p>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="管理番号・顧客名・期限で検索"
          className="w-full sm:w-96"
        />
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
            {isSearching
              ? "該当する受注が見つかりません。"
              : "現在、未回収はありません 🎉"}
          </div>
        ) : (
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wider text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-medium">管理番号</th>
                <th className="px-4 py-3 font-medium">顧客名</th>
                <th className="px-4 py-3 font-medium">請求日</th>
                <th className="px-4 py-3 font-medium">振込期限</th>
                <th className="px-4 py-3 font-medium">状態</th>
                <th className="px-4 py-3 text-right font-medium">金額</th>
                <th className="px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                >
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link
                      href={`/dashboard/orders/${r.id}`}
                      className="text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-50"
                    >
                      {r.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-900 dark:text-zinc-50">
                    {r.customer_name ? (
                      r.customer_id ? (
                        <Link
                          href={`/dashboard/customers/${r.customer_id}`}
                          className="hover:underline"
                        >
                          {r.customer_name}
                        </Link>
                      ) : (
                        r.customer_name
                      )
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {formatDateOnly(r.invoiced_at)}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                    {formatDueDate(r.payment_due_date)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} days={r.days} />
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-zinc-900 dark:text-zinc-50">
                    {formatYen(r.owed_amount)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleMarkPaid(r.id)}
                      disabled={pendingId === r.id}
                      className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      {pendingId === r.id ? "更新中..." : "入金確認"}
                    </button>
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
