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
  // 空文字 = 未入力（内訳なし）。片方でも値があれば内訳ありとみなし単価は自動計算される。
  labor_cost: string;
  parts_cost: string;
  unit_price: string;
};

// 工賃 / 部品代の少なくとも片方に値が入っているか（= 単価が自動計算モード）
function hasBreakdown(r: ItemRow): boolean {
  return r.labor_cost !== "" || r.parts_cost !== "";
}

function toRow(i: OrderItem): ItemRow {
  return {
    name: i.name,
    quantity: String(i.quantity),
    labor_cost: i.labor_cost !== undefined ? String(i.labor_cost) : "",
    parts_cost: i.parts_cost !== undefined ? String(i.parts_cost) : "",
    unit_price: String(i.unit_price),
  };
}

function toItem(r: ItemRow): OrderItem {
  const quantity = Number(r.quantity) || 0;
  if (hasBreakdown(r)) {
    const labor = Number(r.labor_cost) || 0;
    const parts = Number(r.parts_cost) || 0;
    const item: OrderItem = {
      name: r.name,
      quantity,
      unit_price: labor + parts,
    };
    if (r.labor_cost !== "") item.labor_cost = labor;
    if (r.parts_cost !== "") item.parts_cost = parts;
    return item;
  }
  return {
    name: r.name,
    quantity,
    unit_price: Number(r.unit_price) || 0,
  };
}

const emptyRow = (): ItemRow => ({
  name: "",
  quantity: "1",
  labor_cost: "",
  parts_cost: "",
  unit_price: "0",
});

// 既存 items を 3 セクションに振り分ける（type / tax_free による）
function splitInitial(items: OrderItem[]): {
  normal: ItemRow[];
  shakenTaxable: ItemRow[];
  shakenTaxFree: ItemRow[];
} {
  const normal: ItemRow[] = [];
  const shakenTaxable: ItemRow[] = [];
  const shakenTaxFree: ItemRow[] = [];
  for (const it of items) {
    const r = toRow(it);
    if (it.type === "shaken") {
      if (it.tax_free) shakenTaxFree.push(r);
      else shakenTaxable.push(r);
    } else {
      normal.push(r);
    }
  }
  return { normal, shakenTaxable, shakenTaxFree };
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

  // useState 初期値は初回 render でのみ使われるため、useMemo 不要
  const split = splitInitial(initialItems);

  const [normalRows, setNormalRows] = useState<ItemRow[]>(
    split.normal.length > 0
      ? split.normal
      : [emptyRow()],
  );
  const [shakenTaxableRows, setShakenTaxableRows] = useState<ItemRow[]>(
    split.shakenTaxable,
  );
  const [shakenTaxFreeRows, setShakenTaxFreeRows] = useState<ItemRow[]>(
    split.shakenTaxFree,
  );
  const [shakenOpen, setShakenOpen] = useState(
    split.shakenTaxable.length + split.shakenTaxFree.length > 0,
  );
  const [discount, setDiscount] = useState(String(initialDiscount));
  const [deposit, setDeposit] = useState(String(initialDeposit));

  // 全セクションの item 配列を組み立てて totals 計算。保存用 JSON もここから作る。
  const allItems: OrderItem[] = [
    ...normalRows.map((r) => toItem(r)),
    ...shakenTaxableRows.map((r) => ({
      ...toItem(r),
      type: "shaken" as const,
    })),
    ...shakenTaxFreeRows.map((r) => ({
      ...toItem(r),
      type: "shaken" as const,
      tax_free: true,
    })),
  ];

  const totals = calculateTotals(
    allItems,
    Number(discount) || 0,
    Number(deposit) || 0,
  );

  const itemsToSave = allItems.filter((i) => i.name.trim() !== "");

  const shakenFilledCount =
    shakenTaxableRows.filter((r) => r.name.trim() !== "").length +
    shakenTaxFreeRows.filter((r) => r.name.trim() !== "").length;

  function openShaken() {
    setShakenOpen(true);
    // 初回展開時は各サブセクションに空行を1つ用意しておく
    if (shakenTaxableRows.length === 0) {
      setShakenTaxableRows([emptyRow()]);
    }
    if (shakenTaxFreeRows.length === 0) {
      setShakenTaxFreeRows([emptyRow()]);
    }
  }

  return (
    <form action={formAction} className="space-y-6">
      <input
        type="hidden"
        name="items_json"
        value={JSON.stringify(itemsToSave)}
      />
      <input
        type="hidden"
        name="discount_amount"
        value={Number(discount) || 0}
      />
      <input
        type="hidden"
        name="deposit_amount"
        value={Number(deposit) || 0}
      />

      {/* 通常明細 */}
      <section>
        <ItemTableEditor rows={normalRows} onChange={setNormalRows} />
      </section>

      {/* 車検費用セクション */}
      <section>
        {!shakenOpen ? (
          <button
            type="button"
            onClick={openShaken}
            className="w-full rounded-md border border-dashed border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-700 transition-colors hover:border-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:bg-zinc-800"
          >
            ＋ 車検費用を追加
            {shakenFilledCount > 0 && `（入力済み ${shakenFilledCount} 件）`}
          </button>
        ) : (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                車検費用
              </h3>
              <button
                type="button"
                onClick={() => setShakenOpen(false)}
                className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-50"
              >
                閉じる
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <h4 className="mb-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  課税分（消費税10%）
                </h4>
                <ItemTableEditor
                  rows={shakenTaxableRows}
                  onChange={setShakenTaxableRows}
                />
              </div>
              <div>
                <h4 className="mb-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  非課税分（自賠責・重量税・印紙代など）
                </h4>
                <ItemTableEditor
                  rows={shakenTaxFreeRows}
                  onChange={setShakenTaxFreeRows}
                />
              </div>
            </div>
          </div>
        )}
      </section>

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
            {shakenOpen && (
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                ※ 割引は整備費用（通常明細）のみに適用されます
              </p>
            )}
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
          {totals.sections.normal.subtotal > 0 && (
            <Row
              label="整備小計"
              value={formatYen(totals.sections.normal.subtotal)}
            />
          )}
          {totals.sections.shakenTaxable.subtotal > 0 && (
            <Row
              label="車検課税小計"
              value={formatYen(totals.sections.shakenTaxable.subtotal)}
            />
          )}
          {totals.sections.shakenTaxFree.subtotal > 0 && (
            <Row
              label="車検非課税小計"
              value={formatYen(totals.sections.shakenTaxFree.subtotal)}
            />
          )}
          {totals.discount > 0 && (
            <Row
              label="値引き"
              value={`− ${formatYen(totals.discount)}`}
              divider
            />
          )}
          <Row
            label="課税対象額"
            value={formatYen(totals.taxableAmount)}
            divider
          />
          <Row label="消費税(10%)" value={formatYen(totals.tax)} />
          <Row label="合計" value={formatYen(totals.total)} emphasize />
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

function ItemTableEditor({
  rows,
  onChange,
}: {
  rows: ItemRow[];
  onChange: (rows: ItemRow[]) => void;
}) {
  // 工賃 / 部品代 が編集された場合、片方でも値があれば単価を自動計算で上書き。
  // 両方クリアされたときは最後の計算値（または元の単価）を残して手動入力可能に戻る。
  function update(i: number, patch: Partial<ItemRow>) {
    onChange(
      rows.map((r, idx) => {
        if (idx !== i) return r;
        const updated = { ...r, ...patch };
        const touchedBreakdown =
          "labor_cost" in patch || "parts_cost" in patch;
        if (touchedBreakdown) {
          const hasBD =
            updated.labor_cost !== "" || updated.parts_cost !== "";
          if (hasBD) {
            const labor = Number(updated.labor_cost) || 0;
            const parts = Number(updated.parts_cost) || 0;
            updated.unit_price = String(labor + parts);
          }
        }
        return updated;
      }),
    );
  }
  function add() {
    onChange([...rows, emptyRow()]);
  }
  function remove(i: number) {
    onChange(rows.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wider text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
            <tr>
              <th
                className="px-3 py-2 font-medium"
                style={{ minWidth: "200px" }}
              >
                品名
              </th>
              <th className="px-3 py-2 font-medium" style={{ width: "80px" }}>
                数量
              </th>
              <th className="px-3 py-2 font-medium" style={{ width: "120px" }}>
                工賃
              </th>
              <th className="px-3 py-2 font-medium" style={{ width: "120px" }}>
                部品代
              </th>
              <th className="px-3 py-2 font-medium" style={{ width: "150px" }}>
                単価
              </th>
              <th
                className="px-3 py-2 text-right font-medium"
                style={{ width: "120px" }}
              >
                小計
              </th>
              <th className="px-3 py-2" style={{ width: "56px" }} />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-4 text-center text-xs text-zinc-400 dark:text-zinc-500"
                >
                  明細はありません
                </td>
              </tr>
            ) : (
              rows.map((r, i) => {
                const auto = hasBreakdown(r);
                return (
                <tr key={i}>
                  <td className="px-3 py-2">
                    <input
                      value={r.name}
                      onChange={(e) => update(i, { name: e.target.value })}
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
                      onChange={(e) => update(i, { quantity: e.target.value })}
                      className={`${cellInputClass} text-right`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      value={r.labor_cost}
                      onChange={(e) =>
                        update(i, { labor_cost: e.target.value })
                      }
                      placeholder="—"
                      className={`${cellInputClass} text-right`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      value={r.parts_cost}
                      onChange={(e) =>
                        update(i, { parts_cost: e.target.value })
                      }
                      placeholder="—"
                      className={`${cellInputClass} text-right`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        value={r.unit_price}
                        onChange={(e) =>
                          update(i, { unit_price: e.target.value })
                        }
                        readOnly={auto}
                        title={
                          auto
                            ? "工賃と部品代から自動計算されます（両方を空にすると手動入力可能）"
                            : undefined
                        }
                        className={`${cellInputClass} text-right ${
                          auto
                            ? "cursor-not-allowed bg-zinc-100 text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-400"
                            : ""
                        }`}
                      />
                      {auto && (
                        <span
                          aria-hidden
                          className="shrink-0 rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-medium leading-none text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
                        >
                          自動
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-900 dark:text-zinc-50">
                    {formatYen(rowSubtotal(toItem(r)))}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      aria-label="行を削除"
                      className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-red-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-red-400"
                    >
                      ×
                    </button>
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={add}
        className="rounded-md border border-dashed border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-700 transition-colors hover:border-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:bg-zinc-800"
      >
        ＋ 明細行を追加
      </button>
    </div>
  );
}

function Row({
  label,
  value,
  emphasize,
  divider,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  divider?: boolean;
}) {
  const className = emphasize
    ? "border-t border-zinc-200 pt-1.5 text-base font-semibold text-zinc-900 dark:border-zinc-800 dark:text-zinc-50"
    : divider
      ? "border-t border-zinc-200 pt-1.5 text-zinc-700 dark:border-zinc-800 dark:text-zinc-300"
      : "text-zinc-700 dark:text-zinc-300";
  return (
    <div className={`flex items-baseline justify-between ${className}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
