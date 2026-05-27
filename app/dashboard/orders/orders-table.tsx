"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import DeleteButton from "@/lib/components/delete-button";
import PaymentDueModal, {
  calculateDefaultDueDate,
} from "@/lib/components/payment-due-modal";
import StatusDropdown from "@/lib/components/status-dropdown";
import { formatYen } from "@/lib/format";
import {
  ESTIMATE_STATUSES,
  INVOICE_STATUSES,
  WORK_STATUSES,
  type OrderListRow,
  type WorkStatus,
} from "@/lib/types";
import {
  deleteOrder,
  updateArchived,
  updateEstimateStatus,
  updateInvoiceStatus,
  updateWorkStatus,
} from "./actions";
import { estimateClass, invoiceClass, workClass } from "./status-badge";

export type OrderKanbanRow = OrderListRow & {
  amount: number | null;
};

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFKC");
}

function formatDate(s: string): string {
  return s.replace(/-/g, "/");
}

function buildHaystack(o: OrderKanbanRow): string {
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

const COLUMNS: { key: WorkStatus; desc: string }[] = [
  { key: "受付", desc: "入庫したばかり" },
  { key: "作業中", desc: "メカニックの手元" },
  { key: "完了", desc: "納車・請求待ち" },
];

type Props = {
  rows: OrderKanbanRow[];
};

export default function OrdersTable({ rows }: Props) {
  const [query, setQuery] = useState("");
  const [paymentDueFor, setPaymentDueFor] = useState<string | null>(null);

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

  const grouped = useMemo(() => {
    const map: Record<WorkStatus, OrderKanbanRow[]> = {
      受付: [],
      作業中: [],
      完了: [],
    };
    for (const o of filtered) {
      map[o.work_status].push(o);
    }
    return map;
  }, [filtered]);

  const isSearching = query.trim().length > 0;

  return (
    <>
      {/* 検索バー */}
      <div className="border-b border-[var(--color-line)] bg-[var(--color-paper)] px-8 py-4 flex flex-wrap items-center gap-4">
        <div className="wos-search max-w-[480px]">
          <span className="wos-ico">⌕</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="管理番号・顧客名・車種・メモで検索…"
          />
        </div>
        <span className="text-xs text-[var(--color-ink-light)] tracking-widest">
          {isSearching
            ? `${rows.length} 件中 ${filtered.length} 件`
            : `登録件数 ${rows.length} 件`}
        </span>
      </div>

      {/* カンバン本体 */}
      <div className="flex-1 overflow-auto bg-[var(--color-line)]">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px min-h-full">
          {COLUMNS.map((col, ci) => {
            const items = grouped[col.key];
            return (
              <div
                key={col.key}
                className="flex flex-col gap-3 p-5 min-h-full"
                style={{
                  background:
                    ci === 1
                      ? "var(--color-paper)"
                      : "var(--color-cream)",
                }}
              >
                <div className="flex items-baseline justify-between">
                  <div className="flex items-baseline gap-3">
                    <span
                      className="text-xl font-semibold text-[var(--color-ink)]"
                      style={{ letterSpacing: "0.04em" }}
                    >
                      {col.key}
                    </span>
                    <span className="text-xs text-[var(--color-ink-light)] font-medium">
                      {col.desc}
                    </span>
                  </div>
                  <span className="wos-num-big text-2xl text-[var(--color-accent)]">
                    {items.length}
                    <span className="text-xs text-[var(--color-ink-light)] ml-1">
                      件
                    </span>
                  </span>
                </div>
                <div className="wos-hair" />
                <div className="flex flex-col gap-3">
                  {items.length === 0 ? (
                    <div className="text-center text-sm text-[var(--color-ink-light)] py-8 font-medium">
                      該当なし
                    </div>
                  ) : (
                    items.map((o) => (
                      <BoardCard
                        key={o.id}
                        o={o}
                        active={ci === 1}
                        onRequestInvoiceDue={(id) => setPaymentDueFor(id)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
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

function BoardCard({
  o,
  active,
  onRequestInvoiceDue,
}: {
  o: OrderKanbanRow;
  active: boolean;
  onRequestInvoiceDue: (id: string) => void;
}) {
  const overdue =
    o.invoice_status === "請求済" &&
    o.payment_due_date != null &&
    new Date(o.payment_due_date) < new Date(new Date().toISOString().slice(0, 10));

  return (
    <div
      className="border border-[var(--color-line)] p-4 flex flex-col gap-2.5"
      style={{
        background: active ? "var(--color-cream)" : "var(--color-paper)",
      }}
    >
      <div className="flex justify-between items-baseline">
        <Link
          href={`/dashboard/orders/${o.id}`}
          className="wos-num text-base font-medium hover:underline"
          style={{
            color: overdue
              ? "var(--color-warn)"
              : "var(--color-accent)",
          }}
        >
          No. {o.id}
        </Link>
        <span className="text-xs text-[var(--color-ink-light)] font-medium">
          {formatDate(o.reception_date)}
        </span>
      </div>

      <div
        className="text-sm font-semibold text-[var(--color-ink)] leading-snug"
        style={{ letterSpacing: "0.02em" }}
      >
        {o.vehicle?.maker || o.vehicle?.model
          ? `${o.vehicle?.maker ?? ""} ${o.vehicle?.model ?? ""}`.trim()
          : o.vehicle?.plate_number ?? "（車両未設定）"}
      </div>

      <div className="text-xs font-medium text-[var(--color-ink-soft)]">
        {o.customer ? (
          <Link
            href={`/dashboard/customers/${o.customer.id}`}
            className="hover:underline"
          >
            {o.customer.name} 様
          </Link>
        ) : (
          "—"
        )}
        {o.vehicle?.plate_number && (
          <span className="text-[var(--color-ink-light)] font-normal">
            {" "}／ {o.vehicle.plate_number}
          </span>
        )}
      </div>

      {o.notes && (
        <div
          className="text-xs text-[var(--color-ink-mid)] overflow-hidden"
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            lineHeight: 1.55,
          }}
        >
          {o.notes}
        </div>
      )}

      <div className="wos-hair" />

      {/* ステータス3行（ドロップダウンは変更可能） */}
      <div className="flex flex-col gap-1.5">
        <StatusRow label="作業">
          <StatusDropdown
            value={o.work_status}
            options={WORK_STATUSES}
            classMap={workClass}
            onSelect={(next) => updateWorkStatus(o.id, next)}
            ariaLabel="作業ステータスを変更"
            baseClassName="wos-status"
          />
        </StatusRow>
        <StatusRow
          label="見積"
          href={
            o.estimate_status === "発行済" || o.estimate_status === "了承済"
              ? `/dashboard/orders/${o.id}/estimate`
              : undefined
          }
        >
          <StatusDropdown
            value={o.estimate_status}
            options={ESTIMATE_STATUSES}
            classMap={estimateClass}
            onSelect={(next) => updateEstimateStatus(o.id, next)}
            ariaLabel="見積ステータスを変更"
            baseClassName="wos-status"
          />
        </StatusRow>
        <StatusRow
          label="請求"
          href={
            o.invoice_status === "請求済" || o.invoice_status === "入金済"
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
                onRequestInvoiceDue(o.id);
              } else {
                await updateInvoiceStatus(o.id, next);
              }
            }}
            ariaLabel="請求ステータスを変更"
            baseClassName="wos-status"
          />
        </StatusRow>
      </div>

      <div className="flex justify-between items-end pt-1">
        <div className="flex gap-1.5">
          <Link
            href={`/dashboard/orders/${o.id}/edit`}
            className="wos-btn-ghost wos-btn-xs"
          >
            編集
          </Link>
          <DeleteButton
            action={deleteOrder}
            hidden={{ id: o.id }}
            confirmMessage={`受注「${o.id}」を削除します。よろしいですか？`}
            label="削除"
            className="wos-btn-danger wos-btn-xs"
          />
        </div>
        {o.amount != null && (
          <span className="wos-yen text-base font-medium text-[var(--color-ink)]">
            {formatYen(o.amount)}
          </span>
        )}
      </div>
    </div>
  );
}

function StatusRow({
  label,
  href,
  children,
}: {
  label: string;
  href?: string;
  children: React.ReactNode;
}) {
  const labelClass =
    "text-[10px] font-semibold tracking-[0.16em] text-[var(--color-ink-light)] w-8 shrink-0";
  return (
    <div className="flex items-center gap-3">
      {href ? (
        <Link href={href} className={`${labelClass} hover:underline`}>
          {label}
        </Link>
      ) : (
        <span className={labelClass}>{label}</span>
      )}
      {children}
    </div>
  );
}
