"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Customer } from "@/lib/types";
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

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return rows;
    const needle = normalize(q);
    return rows.filter((c) => buildHaystack(c).includes(needle));
  }, [rows, query]);

  const isSearching = query.trim().length > 0;

  return (
    <>
      {/* 検索バー */}
      <div className="border-b border-[var(--color-line)] bg-[var(--color-paper)] px-4 sm:px-8 py-4 flex flex-wrap items-center gap-4">
        <div className="wos-search max-w-[480px]">
          <span className="wos-ico">⌕</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="顧客名・フリガナ・電話番号・メモで検索…"
          />
        </div>
        <span className="text-xs text-[var(--color-ink-light)] tracking-widest">
          {isSearching
            ? `${rows.length} 件中 ${filtered.length} 件`
            : `登録件数 ${rows.length} 件`}
        </span>
      </div>

      <div className="flex-1 overflow-auto bg-[var(--color-cream)]">
        <div className="px-4 sm:px-8 py-6">
          {filtered.length === 0 ? (
            <div className="wos-card text-center py-12 text-sm text-[var(--color-ink-light)]">
              {isSearching
                ? "該当する顧客が見つかりません。"
                : "顧客が登録されていません。"}
            </div>
          ) : (
            <table className="w-full border-collapse bg-[var(--color-paper)] border border-[var(--color-line)]">
              <thead>
                <tr className="border-b-2 border-[var(--color-line-strong)] bg-[var(--color-cream)]">
                  <th className="wos-th w-[12%]">顧客ID</th>
                  <th className="wos-th w-[18%]">氏名</th>
                  <th className="wos-th w-[16%]">フリガナ</th>
                  <th className="wos-th w-[15%]">電話番号</th>
                  <th className="wos-th w-[18%]">メールアドレス</th>
                  <th className="wos-th">メモ</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => (
                  <tr
                    key={c.id}
                    className="border-b border-[var(--color-line)] hover:bg-[var(--color-cream)] transition-colors"
                    style={{
                      background:
                        i % 2 === 1 ? "var(--color-cream)" : "transparent",
                    }}
                  >
                    <td className="wos-td">
                      <Link
                        href={`/dashboard/customers/${c.id}`}
                        className="wos-serif-num text-base hover:underline"
                      >
                        {c.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="wos-td">
                      <Link
                        href={`/dashboard/customers/${c.id}`}
                        className="font-semibold text-[var(--color-ink)] hover:underline"
                      >
                        {c.name} 様
                      </Link>
                    </td>
                    <td className="wos-td muted">{c.name_kana ?? "—"}</td>
                    <td className="wos-td num">{c.phone ?? "—"}</td>
                    <td className="wos-td muted">{c.email ?? "—"}</td>
                    <td className="wos-td muted max-w-xs">
                      {c.notes ? (
                        <Tooltip content={c.notes} className="block w-full">
                          <span className="block truncate">{c.notes}</span>
                        </Tooltip>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
