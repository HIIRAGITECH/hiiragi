"use client";

import { useActionState, useState } from "react";
import type { OrderItem } from "@/lib/types";
import { calculateTotals, rowSubtotal } from "@/lib/orders/totals";
import { formatYen } from "@/lib/format";
import type { FormState } from "../actions";

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  initialItems: OrderItem[];
  initialDiscount: number;
  initialDeposit: number;
};

type ItemRow = {
  name: string;
  quantity: string;
  unit_price: string;
};

function toRow(i: OrderItem): ItemRow {
  return {
    name: i.name,
    quantity: String(i.quantity),
    unit_price: String(i.unit_price),
  };
}

function toItem(r: ItemRow): OrderItem {
  return {
    name: r.name,
    quantity: Number(r.quantity) || 0,
    unit_price: Number(r.unit_price) || 0,
  };
}

const cellInputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-50 dark:focus:ring-zinc-50";

const labelClass =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";

export default function ItemsForm({
  action,
  initialItems,
  initialDiscount,
  initialDeposit,
}: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    undefined,
  );

  const [rows, setRows] = useState<ItemRow[]>(
    initialItems.length > 0
      ? initialItems.map(toRow)
      : [{ name: "", quantity: "1", unit_price: "0" }],
  );
  const [discount, setDiscount] = useState(String(initialDiscount));
  const [deposit, setDeposit] = useState(String(initialDeposit));

  const items = rows.map(toItem);
  const totals = calculateTotals(
    items,
    Number(discount) || 0,
    Number(deposit) || 0,
  );

  // 保存対象の items（空品名はスキップ）
  const itemsToSave = items.filter((i) => i.name.trim() !== "");

  function updateRow(i: number, patch: Partial<ItemRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, { name: "", quantity: "1", unit_price: "0" }]);
  }

  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="items_json" value={JSON.stringify(itemsToSave)} />
      <input type="hidden" name="discount_amount" value={Number(discount) || 0} />
      <input type="hidden" name="deposit_amount" value={Number(deposit) || 0} />

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wider text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2 font-medium" style={{ minWidth: "240px" }}>
                品名
              </th>
              <th className="px-3 py-2 font-medium" style={{ width: "100px" }}>
                数量
              </th>
              <th className="px-3 py-2 font-medium" style={{ width: "140px" }}>
                単価
              </th>
              <th className="px-3 py-2 text-right font-medium" style={{ width: "140px" }}>
                小計
              </th>
              <th className="px-3 py-2" style={{ width: "60px" }} />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="px-3 py-2">
                  <input
                    value={r.name}
                    onChange={(e) => updateRow(i, { name: e.target.value })}
                    placeholder="例: エンジンオイル交換"
                    className={cellInputClass}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.1"
                    value={r.quantity}
                    onChange={(e) => updateRow(i, { quantity: e.target.value })}
                    className={`${cellInputClass} text-right`}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    value={r.unit_price}
                    onChange={(e) => updateRow(i, { unit_price: e.target.value })}
                    className={`${cellInputClass} text-right`}
                  />
                </td>
                <td className="px-3 py-2 text-right text-zinc-900 dark:text-zinc-50">
                  {formatYen(rowSubtotal(toItem(r)))}
                </td>
                <td className="px-3 py-2 text-center">
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    aria-label="行を削除"
                    className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-red-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-red-400"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={addRow}
        className="rounded-md border border-dashed border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-700 transition-colors hover:border-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:bg-zinc-800"
      >
        ＋ 明細行を追加
      </button>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-3">
          <div>
            <label htmlFor="discount" className={labelClass}>
              割引金額
            </label>
            <input
              id="discount"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              className={`${cellInputClass} text-right`}
            />
          </div>
          <div>
            <label htmlFor="deposit" className={labelClass}>
              預かり金
            </label>
            <input
              id="deposit"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              className={`${cellInputClass} text-right`}
            />
          </div>
        </div>

        <dl className="space-y-1.5 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950">
          <Row label="小計" value={formatYen(totals.subtotal)} />
          {totals.discount > 0 && (
            <Row label="値引き" value={`− ${formatYen(totals.discount)}`} />
          )}
          <Row label="課税対象額" value={formatYen(totals.taxableAmount)} />
          <Row label="消費税(10%)" value={formatYen(totals.tax)} />
          <Row
            label="合計"
            value={formatYen(totals.total)}
            emphasize
          />
          {totals.deposit > 0 && (
            <>
              <Row label="預かり金" value={`− ${formatYen(totals.deposit)}`} />
              <Row
                label="差引請求額"
                value={formatYen(totals.balance)}
                emphasize
              />
            </>
          )}
        </dl>
      </div>

      {state?.error && (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {state.error}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {pending ? "保存中..." : "明細を保存"}
        </button>
      </div>
    </form>
  );
}

function Row({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between ${emphasize ? "border-t border-zinc-200 pt-1.5 text-base font-semibold text-zinc-900 dark:border-zinc-800 dark:text-zinc-50" : "text-zinc-700 dark:text-zinc-300"}`}
    >
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
