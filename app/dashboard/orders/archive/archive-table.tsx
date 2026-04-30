"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import DeleteButton from "@/lib/components/delete-button";
import SearchInput from "@/lib/components/search-input";
import StatusRow from "@/lib/components/status-row";
import Tooltip from "@/lib/components/tooltip";
import type { OrderListRow } from "@/lib/types";
import {
  deleteOrder,
  restoreOrderFormAction,
} from "../actions";
import {
  EstimateStatusBadge,
  InvoiceStatusBadge,
  WorkStatusBadge,
} from "../status-badge";

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

export default function ArchiveTable({ rows }: Props) {
  const [query, setQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

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
            : `アーカイブ件数: ${rows.length} 件`}
        </p>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="アーカイブを検索（管理番号・顧客名・車種・メモ等）"
          className="w-full sm:w-96"
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
            {isSearching
              ? "該当するアーカイブが見つかりません。"
              : "アーカイブされた受注はありません。"}
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
                          <WorkStatusBadge value={o.work_status} />
                        </StatusRow>
                        <StatusRow label="見積">
                          <EstimateStatusBadge
                            value={o.estimate_status}
                            orderId={o.id}
                          />
                        </StatusRow>
                        <StatusRow label="請求">
                          <InvoiceStatusBadge
                            value={o.invoice_status}
                            orderId={o.id}
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
                        <DeleteButton
                          action={restoreOrderFormAction}
                          hidden={{ id: o.id }}
                          confirmMessage={`受注「${o.id}」をアーカイブから復元しますか？`}
                          label="復元"
                          className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        />
                        <DeleteButton
                          action={deleteOrder}
                          hidden={{ id: o.id }}
                          confirmMessage={`受注「${o.id}」を完全に削除します。よろしいですか？`}
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
