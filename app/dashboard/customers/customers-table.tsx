"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Customer } from "@/lib/types";
import SearchInput from "@/lib/components/search-input";
import Tooltip from "@/lib/components/tooltip";

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFKC");
}

function buildHaystack(c: Customer): string {
  return normalize(
    [c.name, c.name_kana, c.phone, c.email, c.address, c.notes]
      .filter(Boolean)
      .join(" "),
  );
}

type Props = {
  rows: Customer[];
};

export default function CustomersTable({ rows }: Props) {
  const [query, setQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return rows;
    const needle = normalize(q);
    return rows.filter((c) => buildHaystack(c).includes(needle));
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
          placeholder="顧客を検索（名前・電話・メモ等）"
          className="w-full sm:w-80"
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
            {isSearching
              ? "該当する顧客が見つかりません。"
              : "顧客が登録されていません。"}
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
                <th className="px-4 py-3 font-medium">メモ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {filtered.map((c) => {
                const expanded = expandedIds.has(c.id);
                const hasNotes = !!c.notes && c.notes.trim() !== "";
                return (
                  <tr
                    key={c.id}
                    className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  >
                    <td className="px-4 py-3 align-top font-mono text-xs text-zinc-700 dark:text-zinc-300">
                      <Link
                        href={`/dashboard/customers/${c.id}`}
                        className="text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-50"
                      >
                        {c.id}
                      </Link>
                    </td>
                    <td className="px-4 py-3 align-top text-zinc-900 dark:text-zinc-50">
                      <Link
                        href={`/dashboard/customers/${c.id}`}
                        className="hover:underline"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 align-top text-zinc-600 dark:text-zinc-400">
                      {c.name_kana ?? "—"}
                    </td>
                    <td className="px-4 py-3 align-top text-zinc-600 dark:text-zinc-400">
                      {c.phone ?? "—"}
                    </td>
                    <td className="px-4 py-3 align-top text-zinc-600 dark:text-zinc-400">
                      {c.email ?? "—"}
                    </td>
                    <td className="px-4 py-3 align-top text-zinc-600 dark:text-zinc-400">
                      {hasNotes ? (
                        <NotesCell
                          notes={c.notes as string}
                          expanded={expanded}
                          onToggle={() => toggleExpanded(c.id)}
                        />
                      ) : (
                        <span>—</span>
                      )}
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
          className="block w-full min-h-11 cursor-pointer text-left"
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
