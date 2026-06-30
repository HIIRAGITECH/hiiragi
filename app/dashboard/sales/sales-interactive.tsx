"use client";

import { useState } from "react";
import Link from "next/link";
import { formatYen } from "@/lib/format";

/* 折りたたみセクション（デフォルト閉じ）。税区分別・利益の格下げ用。 */
export function Collapsible({
  title,
  hint,
  defaultOpen = false,
  children,
}: {
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="wos-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <span className="wos-sec-label">
          {title}
          {hint && (
            <span className="ml-2 text-xs font-normal text-[var(--color-ink-light)]">
              {hint}
            </span>
          )}
        </span>
        <span
          className="text-sm text-[var(--color-ink-light)] transition-transform"
          style={{ transform: open ? "rotate(180deg)" : "none" }}
          aria-hidden
        >
          ▾
        </span>
      </button>
      {open && <div className="mt-4">{children}</div>}
    </section>
  );
}

export type DetailRow = {
  id: string;
  invoiced_at: string;
  customerId: string | null;
  customerName: string | null;
  workStatus: string;
  isComplete: boolean;
  total: number;
};

function formatDateOnly(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, "/");
}

/* 受注明細：直近 INITIAL 件を表示し、残りは「今月の全件を見る →」で展開。 */
export function OrderDetailTable({
  rows,
  initial = 8,
}: {
  rows: DetailRow[];
  initial?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, initial);
  const hidden = rows.length - visible.length;

  return (
    <>
      <table className="w-full border-collapse bg-[var(--color-paper)] border border-[var(--color-line)]">
        <thead>
          <tr className="border-b-2 border-[var(--color-line-strong)] bg-[var(--color-cream)]">
            <th className="wos-th">請求日</th>
            <th className="wos-th">管理番号</th>
            <th className="wos-th">顧客名</th>
            <th className="wos-th">作業</th>
            <th className="wos-th">区分</th>
            <th className="wos-th right">金額</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((o, i) => (
            <tr
              key={o.id}
              className="border-b border-[var(--color-line)]"
              style={{
                background: i % 2 === 1 ? "var(--color-cream)" : "transparent",
              }}
            >
              <td className="wos-td num muted">{formatDateOnly(o.invoiced_at)}</td>
              <td className="wos-td">
                <Link
                  href={`/dashboard/orders/${o.id}`}
                  className="wos-serif-num hover:underline"
                >
                  {o.id.slice(0, 8)}
                </Link>
              </td>
              <td className="wos-td">
                {o.customerId ? (
                  <Link
                    href={`/dashboard/customers/${o.customerId}`}
                    className="font-semibold text-[var(--color-ink)] hover:underline"
                  >
                    {o.customerName} 様
                  </Link>
                ) : (
                  "—"
                )}
              </td>
              <td className="wos-td muted">{o.workStatus}</td>
              <td className="wos-td">
                {o.isComplete ? (
                  <span className="wos-status w-k">売上</span>
                ) : (
                  <span className="wos-status w-s">前受金</span>
                )}
              </td>
              <td className="wos-td num right">{formatYen(o.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-3 text-sm text-[var(--color-accent)] hover:underline"
        >
          今月の全件を見る →（残り{hidden}件）
        </button>
      )}
      {expanded && rows.length > initial && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="mt-3 text-sm text-[var(--color-ink-light)] hover:underline"
        >
          ← 直近{initial}件に戻す
        </button>
      )}
    </>
  );
}
