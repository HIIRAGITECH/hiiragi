"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import DeleteButton from "@/lib/components/delete-button";
import PaymentDueModal, {
  calculateDefaultDueDate,
} from "@/lib/components/payment-due-modal";
import SearchInput from "@/lib/components/search-input";
import StatusDropdown from "@/lib/components/status-dropdown";
import StatusRow from "@/lib/components/status-row";
import Tooltip from "@/lib/components/tooltip";
import {
  ESTIMATE_STATUSES,
  INVOICE_STATUSES,
  WORK_STATUSES,
  type OrderListRow,
} from "@/lib/types";
import {
  deleteOrder,
  updateArchived,
  updateEstimateStatus,
  updateInvoiceStatus,
  updateWorkStatus,
} from "./actions";
import { estimateClass, invoiceClass, workClass } from "./status-badge";

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFKC");
}

function formatDate(s: string): string {
  return s.replace(/-/g, "/");
}

function buildHaystack(o: OrderListRow): string {
  return normalize(
    [
      o.id,
      o.customer?.name,
      o.customer?.name_kana,
      o.vehicle?.maker,
      o.vehicle?.model,
      o.vehicle?.plate_number,
      o.notes,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

type Props = {
  rows: OrderListRow[];
};

export default function OrdersTable({ rows }: Props) {
  const [query, setQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [paymentDueFor, setPaymentDueFor] = useState<string | null>(null);

  // 「請求済」確定後の共通処理: invoice 更新 + アーカイブ提案
  async function applyInvoiced(
    orderId: string,
    dueDate: string,
    subject: string | null,
  ) {
    const result = await updateInvoiceStatus(
      orderId,
      "請求済",
      dueDate,
      subject,
    );
    if (
      !result &&
      typeof window !== "undefined" &&
      window.confirm(
        `受注「${orderId}」をアーカイブして一覧から非表示にしますか？`,
      )
    ) {
      await updateArchived(orderId, true);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return rows;
    const needle = normalize(q);
    return rows.filter((o) => buildHaystack(o).includes(needle));
  }, [rows, query]);

  const isSearching = query.trim().length > 0;

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {isSearching
            ? `${rows.length} 件中 ${filtered.length} 件表示`
            : `登録件数: ${rows.length} 件`}
        </p>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="受注を検索（管理番号・顧客名・車種・メモ等）"
          className="w-full sm:w-96"
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
            {isSearching
              ? "該当する受注が見つかりません。"
              : "受注が登録されていません。"}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wider text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-medium">管理番号</th>
                <th className="px-4 py-3 font-medium">顧客名</th>
                <th className="px-4 py-3 font-medium">車種</th>
                <th className="px-4 py-3 font-medium">受付日</th>
                <th className="px-4 py-3 font-medium">状態</th>
                <th className="px-4 py-3 font-medium">メモ</th>
                <th className="px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {filtered.map((o) => {
                const expanded = expandedIds.has(o.id);
                const hasNotes = !!o.notes && o.notes.trim() !== "";
                return (
                  <tr
                    key={o.id}
                    className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  >
                    <td className="px-4 py-3 align-top font-mono text-xs text-zinc-900 dark:text-zinc-50">
                      <Link
                        href={`/dashboard/orders/${o.id}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {o.id}
                      </Link>
                    </td>
                    <td className="px-4 py-3 align-top text-zinc-900 dark:text-zinc-50">
                      {o.customer ? (
                        <Link
                          href={`/dashboard/customers/${o.customer.id}`}
                          className="hover:underline"
                        >
                          {o.customer.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-zinc-600 dark:text-zinc-400">
                      {o.vehicle?.model ?? o.vehicle?.plate_number ?? "—"}
                    </td>
                    <td className="px-4 py-3 align-top text-zinc-600 dark:text-zinc-400">
                      {formatDate(o.reception_date)}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-col gap-1">
                        <StatusRow label="作業">
                          <StatusDropdown
                            value={o.work_status}
                            options={WORK_STATUSES}
                            classMap={workClass}
                            onSelect={(next) => updateWorkStatus(o.id, next)}
                            ariaLabel="作業ステータスを変更"
                          />
                        </StatusRow>
                        <StatusRow
                          label="見積"
                          href={
                            o.estimate_status === "発行済" ||
                            o.estimate_status === "了承済"
                              ? `/dashboard/orders/${o.id}/estimate`
                              : undefined
                          }
                        >
                          <StatusDropdown
                            value={o.estimate_status}
                            options={ESTIMATE_STATUSES}
                            classMap={estimateClass}
                            onSelect={(next) =>
                              updateEstimateStatus(o.id, next)
                            }
                            ariaLabel="見積ステータスを変更"
                          />
                        </StatusRow>
                        <StatusRow
                          label="請求"
                          href={
                            o.invoice_status === "請求済" ||
                            o.invoice_status === "入金済"
                              ? `/dashboard/orders/${o.id}/invoice`
                              : undefined
                          }
                        >
                          <StatusDropdown
                            value={o.invoice_status}
                            options={INVOICE_STATUSES}
                            classMap={invoiceClass}
                            onSelect={async (next) => {
                              if (next === "請求済") {
                                setPaymentDueFor(o.id);
                              } else {
                                await updateInvoiceStatus(o.id, next);
                              }
                            }}
                            ariaLabel="請求ステータスを変更"
                          />
                        </StatusRow>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top text-zinc-600 dark:text-zinc-400">
                      {hasNotes ? (
                        <NotesCell
                          notes={o.notes as string}
                          expanded={expanded}
                          onToggle={() => toggleExpanded(o.id)}
                        />
                      ) : (
                        <span>—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-right">
                      <div className="inline-flex gap-2">
                        <Link
                          href={`/dashboard/orders/${o.id}/edit`}
                          className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          編集
                        </Link>
                        <DeleteButton
                          action={deleteOrder}
                          hidden={{ id: o.id }}
                          confirmMessage={`受注「${o.id}」を削除します。よろしいですか？`}
                          label="削除"
                          className="rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs text-red-700 transition-colors hover:bg-red-50 dark:border-red-900 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950/30"
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {paymentDueFor && (
        <PaymentDueModal
          orderId={paymentDueFor}
          defaultDate={calculateDefaultDueDate(new Date())}
          defaultSubject={
            rows.find((r) => r.id === paymentDueFor)?.invoice_subject ?? null
          }
          onClose={() => setPaymentDueFor(null)}
          onConfirm={async (date, subject) => {
            const orderId = paymentDueFor;
            setPaymentDueFor(null);
            await applyInvoiced(orderId, date, subject);
          }}
        />
      )}
    </>
  );
}

function NotesCell({
  notes,
  expanded,
  onToggle,
}: {
  notes: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="max-w-xs">
      <Tooltip content={notes} className="block w-full">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={expanded ? "メモを閉じる" : "メモを開く"}
          className="block w-full cursor-pointer text-left"
        >
          <span className="block truncate">{notes}</span>
        </button>
      </Tooltip>
      <div
        className={`grid overflow-hidden transition-[grid-template-rows] duration-200 ${
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <p className="mt-2 whitespace-pre-wrap break-words border-t border-zinc-200 pt-2 text-xs leading-relaxed text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
            {notes}
          </p>
        </div>
      </div>
    </div>
  );
}
