"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import PaymentConfirmModal from "@/lib/components/payment-confirm-modal";
import { formatYen } from "@/lib/format";
import { getTodayJst, type PaymentStatus } from "@/lib/payments/classify";
import { updateInvoiceStatus } from "@/app/dashboard/orders/actions";

export type PaymentRow = {
  id: string;
  invoiced_at: string | null;
  payment_due_date: string | null;
  customer_name: string | null;
  customer_id: string | null;
  owed_amount: number;
  status: PaymentStatus;
  days: number;
  is_archived: boolean;
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

function StatusBadge({
  status,
  days,
}: {
  status: PaymentStatus;
  days: number;
}) {
  if (status === "overdue") {
    return (
      <span className="wos-status over">{days}日超過</span>
    );
  }
  if (status === "due_soon") {
    return (
      <span className="wos-status w-s">残り{days}日</span>
    );
  }
  if (status === "on_track") {
    return <span className="wos-status w-k">期限内</span>;
  }
  return <span className="wos-status w-u">期限未設定</span>;
}

export default function PaymentsTable({ rows }: Props) {
  const [query, setQuery] = useState("");
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [paymentConfirmFor, setPaymentConfirmFor] = useState<string | null>(
    null,
  );

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return rows;
    const needle = normalize(q);
    return rows.filter((r) => buildHaystack(r).includes(needle));
  }, [rows, query]);

  const isSearching = query.trim().length > 0;

  async function applyPaid(id: string, paidAt: string) {
    setPendingId(id);
    try {
      const result = await updateInvoiceStatus(
        id,
        "入金済",
        undefined,
        undefined,
        paidAt,
      );
      if (result?.error) {
        window.alert(result.error);
        return;
      }
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  return (
    <>
      <div className="border-b border-[var(--color-line)] bg-[var(--color-paper)] px-4 sm:px-8 py-4 flex flex-wrap items-center gap-4">
        <div className="wos-search max-w-[480px]">
          <span className="wos-ico">⌕</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="管理番号・顧客名・期限で検索…"
          />
        </div>
        <span className="text-xs text-[var(--color-ink-light)] tracking-widest">
          {isSearching
            ? `${rows.length} 件中 ${filtered.length} 件`
            : `未回収 ${rows.length} 件`}
        </span>
      </div>

      <div className="flex-1 overflow-auto bg-[var(--color-cream)]">
        <div className="px-4 sm:px-8 py-6">
          {filtered.length === 0 ? (
            <div className="wos-card text-center py-12 text-sm text-[var(--color-ink-light)]">
              {isSearching
                ? "該当する受注が見つかりません。"
                : "現在、未回収はありません 🎉"}
            </div>
          ) : (
            <table className="w-full min-w-[760px] border-collapse bg-[var(--color-paper)] border border-[var(--color-line)]">
              <thead>
                <tr className="border-b-2 border-[var(--color-line-strong)] bg-[var(--color-cream)]">
                  <th className="wos-th w-[14%]">管理番号</th>
                  <th className="wos-th w-[22%]">顧客名</th>
                  <th className="wos-th w-[12%]">請求日</th>
                  <th className="wos-th w-[12%]">振込期限</th>
                  <th className="wos-th w-[14%]">状態</th>
                  <th className="wos-th right w-[14%]">金額</th>
                  <th className="wos-th right">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr
                    key={r.id}
                    className="border-b border-[var(--color-line)]"
                    style={{
                      background:
                        i % 2 === 1 ? "var(--color-cream)" : "transparent",
                    }}
                  >
                    <td className="wos-td">
                      <Link
                        href={`/dashboard/orders/${r.id}`}
                        className="wos-serif-num hover:underline"
                      >
                        {r.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="wos-td">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        {r.customer_name ? (
                          r.customer_id ? (
                            <Link
                              href={`/dashboard/customers/${r.customer_id}`}
                              className="font-semibold text-[var(--color-ink)] hover:underline"
                            >
                              {r.customer_name} 様
                            </Link>
                          ) : (
                            <span className="font-semibold">
                              {r.customer_name} 様
                            </span>
                          )
                        ) : (
                          "—"
                        )}
                        {r.is_archived && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 border border-[var(--color-line)] text-[var(--color-ink-light)]"
                            title="作業はアーカイブ済み"
                          >
                            アーカイブ済
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="wos-td num muted">
                      {formatDateOnly(r.invoiced_at)}
                    </td>
                    <td className="wos-td num">{formatDueDate(r.payment_due_date)}</td>
                    <td className="wos-td">
                      <StatusBadge status={r.status} days={r.days} />
                    </td>
                    <td className="wos-td num right">
                      {formatYen(r.owed_amount)}
                    </td>
                    <td className="wos-td right">
                      <button
                        type="button"
                        onClick={() => setPaymentConfirmFor(r.id)}
                        disabled={pendingId === r.id}
                        className="wos-btn wos-btn-xs"
                      >
                        {pendingId === r.id ? "更新中…" : "入金確認"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {paymentConfirmFor && (
        <PaymentConfirmModal
          orderId={paymentConfirmFor}
          defaultDate={getTodayJst()}
          onClose={() => setPaymentConfirmFor(null)}
          onConfirm={async (paidAt) => {
            const orderId = paymentConfirmFor;
            setPaymentConfirmFor(null);
            await applyPaid(orderId, paidAt);
          }}
        />
      )}
    </>
  );
}
