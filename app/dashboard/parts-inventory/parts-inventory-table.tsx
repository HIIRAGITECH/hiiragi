"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import SearchInput from "@/lib/components/search-input";
import { formatYen } from "@/lib/format";
import type { PartsInventory } from "@/lib/types";
import {
  adjustStock,
  duplicatePart,
  movePart,
  registerStockIn,
  restorePart,
  softDeletePart,
} from "./actions";

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFKC");
}

// 行の在庫状態を判定。表示優先度: 欠品 > 発注 > 在庫OK。
type StockStatus = "out" | "low" | "ok";
function stockStatus(r: PartsInventory): StockStatus {
  if (r.stock_quantity <= 0) return "out";
  if (r.stock_quantity <= r.reorder_point) return "low";
  return "ok";
}

type Props = {
  rows: PartsInventory[];
  includeDeleted?: boolean;
};

// 入庫モーダル / 棚卸モーダルの状態。
type StockDialog =
  | { kind: "in"; row: PartsInventory }
  | { kind: "adjust"; row: PartsInventory };

export default function PartsInventoryTable({ rows, includeDeleted }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [onlyReorder, setOnlyReorder] = useState(false);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<StockDialog | null>(null);

  // 「発注が必要」件数: deleted_at が立った行は除外する。
  const reorderCount = useMemo(
    () =>
      rows.filter(
        (r) => r.deleted_at === null && stockStatus(r) !== "ok",
      ).length,
    [rows],
  );

  const filtered = useMemo(() => {
    let list = rows;
    if (onlyReorder) list = list.filter((r) => stockStatus(r) !== "ok");
    const q = query.trim();
    if (q) {
      const needle = normalize(q);
      list = list.filter((r) =>
        normalize(
          `${r.name} ${r.supplier ?? ""} ${r.internal_code ?? ""} ${r.external_code ?? ""}`,
        ).includes(needle),
      );
    }
    return list;
  }, [rows, query, onlyReorder]);

  const isFiltering = onlyReorder || query.trim().length > 0;

  function handleMove(id: string, direction: "up" | "down") {
    startTransition(async () => {
      await movePart(id, direction);
      router.refresh();
    });
  }

  async function handleDelete(row: PartsInventory) {
    if (
      !confirm(
        `「${row.name}」を非表示にします。よろしいですか？\n（後から復元できます）`,
      )
    ) {
      return;
    }
    setBusy(true);
    const r = await softDeletePart(row.id);
    setBusy(false);
    if ("error" in r) alert(r.error);
    else router.refresh();
  }

  async function handleRestore(id: string) {
    setBusy(true);
    const r = await restorePart(id);
    setBusy(false);
    if ("error" in r) alert(r.error);
    else router.refresh();
  }

  return (
    <>
      {/* 発注アラート: 件数があるときだけ目立たせて出す */}
      {reorderCount > 0 && !includeDeleted && (
        <div className="mt-3 flex items-center gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm dark:border-red-900/60 dark:bg-red-950/30">
          <span className="font-medium text-red-700 dark:text-red-300">
            🔴 発注が必要: {reorderCount} 件
          </span>
          <button
            type="button"
            onClick={() => setOnlyReorder((v) => !v)}
            className="text-xs text-red-700 underline-offset-2 hover:underline dark:text-red-300"
          >
            {onlyReorder ? "すべて表示" : "発注が必要なものだけ表示"}
          </button>
        </div>
      )}

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {isFiltering
            ? `${rows.length} 件中 ${filtered.length} 件表示`
            : `登録件数: ${rows.length} 件`}
        </p>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="部品名・品番・仕入先で検索"
          className="w-full sm:w-80"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={onlyReorder}
            onChange={(e) => setOnlyReorder(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900"
          />
          発注が必要なものだけ表示
        </label>
        <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={!!includeDeleted}
            onChange={(e) => {
              const url = new URL(window.location.href);
              if (e.target.checked) url.searchParams.set("include_deleted", "1");
              else url.searchParams.delete("include_deleted");
              router.push(url.pathname + url.search);
            }}
            className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900"
          />
          非表示を含める
        </label>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
            {isFiltering
              ? "該当する部品が見つかりません。"
              : "部品が登録されていません。"}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wider text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
              <tr>
                <th className="w-20 px-2 py-3 text-center font-medium">並び</th>
                <th className="px-3 py-3 font-medium">部品名</th>
                <th className="px-3 py-3 text-right font-medium">原価</th>
                <th className="px-3 py-3 text-right font-medium">売価</th>
                <th className="px-3 py-3 text-right font-medium">在庫</th>
                <th className="px-3 py-3 text-right font-medium">発注点</th>
                <th className="px-3 py-3 font-medium">明細</th>
                <th className="px-3 py-3 font-medium">状態</th>
                <th className="w-56 px-3 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {filtered.map((r, idx) => {
                const status = stockStatus(r);
                const deleted = r.deleted_at !== null;
                return (
                  <tr
                    key={r.id}
                    className={`transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${
                      deleted ? "opacity-50" : ""
                    }`}
                  >
                    <td className="px-2 py-3 text-center align-top">
                      <div className="flex justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleMove(r.id, "up")}
                          disabled={
                            pending || idx === 0 || isFiltering || deleted
                          }
                          aria-label="上に移動"
                          title={
                            deleted
                              ? "非表示の部品は並び替えできません"
                              : isFiltering
                                ? "並び替えはフィルタ解除時のみ"
                                : "上に移動"
                          }
                          className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMove(r.id, "down")}
                          disabled={
                            pending ||
                            idx === filtered.length - 1 ||
                            isFiltering ||
                            deleted
                          }
                          aria-label="下に移動"
                          title={
                            deleted
                              ? "非表示の部品は並び替えできません"
                              : isFiltering
                                ? "並び替えはフィルタ解除時のみ"
                                : "下に移動"
                          }
                          className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          ↓
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top text-zinc-900 dark:text-zinc-50">
                      {deleted ? (
                        <span>{r.name}</span>
                      ) : (
                        <Link
                          href={`/dashboard/parts-inventory/${r.id}/edit`}
                          className="hover:underline"
                        >
                          {r.name}
                        </Link>
                      )}
                      {deleted && (
                        <span className="ml-2 rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300">
                          非表示
                        </span>
                      )}
                      {(r.internal_code || r.external_code) && (
                        <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                          {r.internal_code && <>社内: {r.internal_code}</>}
                          {r.internal_code && r.external_code && " / "}
                          {r.external_code && <>社外: {r.external_code}</>}
                        </div>
                      )}
                      {r.supplier && (
                        <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                          仕入先: {r.supplier}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right align-top text-zinc-700 dark:text-zinc-300">
                      {formatYen(r.cost_price)}
                    </td>
                    <td className="px-3 py-3 text-right align-top text-zinc-700 dark:text-zinc-300">
                      {r.sale_price != null ? formatYen(r.sale_price) : "—"}
                    </td>
                    <td className="px-3 py-3 text-right align-top font-medium text-zinc-900 dark:text-zinc-50">
                      {r.stock_quantity}
                      {r.unit ? (
                        <span className="ml-0.5 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                          {r.unit}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-right align-top text-zinc-700 dark:text-zinc-300">
                      {r.reorder_point}
                    </td>
                    <td className="px-3 py-3 align-top">
                      {r.show_in_detail ? (
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                          出す
                        </span>
                      ) : (
                        <span
                          className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                          title="間接材料: 明細には出さず工賃に含む扱い"
                        >
                          間接材料
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <StatusBadge status={status} />
                    </td>
                    <td className="px-3 py-3 align-top">
                      {deleted ? (
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleRestore(r.id)}
                            disabled={busy}
                            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                          >
                            復元
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setDialog({ kind: "in", row: r })}
                            disabled={busy}
                            className="rounded-md border border-emerald-200 bg-white px-2 py-1 text-xs text-emerald-700 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-900 dark:bg-zinc-900 dark:text-emerald-400 dark:hover:bg-emerald-950"
                          >
                            入庫
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDialog({ kind: "adjust", row: r })
                            }
                            disabled={busy}
                            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                          >
                            棚卸
                          </button>
                          <Link
                            href={`/dashboard/parts-inventory/${r.id}/edit`}
                            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                          >
                            編集
                          </Link>
                          <form action={duplicatePart}>
                            <input type="hidden" name="id" value={r.id} />
                            <button
                              type="submit"
                              className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                            >
                              複製
                            </button>
                          </form>
                          <button
                            type="button"
                            onClick={() => handleDelete(r)}
                            disabled={busy}
                            className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950"
                          >
                            削除
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {dialog?.kind === "in" && (
        <StockInModal
          row={dialog.row}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            router.refresh();
          }}
        />
      )}
      {dialog?.kind === "adjust" && (
        <StockAdjustModal
          row={dialog.row}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function StatusBadge({ status }: { status: StockStatus }) {
  if (status === "out") {
    return (
      <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-950/60 dark:text-red-300">
        🔴 欠品
      </span>
    );
  }
  if (status === "low") {
    return (
      <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-950/60 dark:text-red-300">
        🔴 発注
      </span>
    );
  }
  return (
    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
      🟢 在庫OK
    </span>
  );
}

function StockInModal({
  row,
  onClose,
  onDone,
}: {
  row: PartsInventory;
  onClose: () => void;
  onDone: () => void;
}) {
  const [qty, setQty] = useState("1");
  const [unitCost, setUnitCost] = useState(String(row.cost_price));
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    const q = Number(qty);
    const uc = unitCost.trim() === "" ? null : Number(unitCost);
    if (!Number.isFinite(q) || q <= 0) {
      setError("入庫数は 0 より大きい数値で入力してください。");
      return;
    }
    if (uc !== null && (!Number.isFinite(uc) || uc < 0)) {
      setError("単価は 0 以上の数値で入力してください。");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await registerStockIn({
      part_id: row.id,
      quantity: q,
      unit_cost: uc,
      memo: memo.trim() === "" ? null : memo.trim(),
    });
    setBusy(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    onDone();
  }

  return (
    <ModalShell
      title={`入庫登録: ${row.name}`}
      onClose={busy ? undefined : onClose}
    >
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        現在の在庫: {row.stock_quantity}
        {row.unit ? ` ${row.unit}` : ""}
      </p>
      <div className="mt-3 space-y-3">
        <Field label="入庫数" required>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.1"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className={modalInputClass}
          />
        </Field>
        <Field label="単価（仕入値、任意）">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={unitCost}
            onChange={(e) => setUnitCost(e.target.value)}
            className={modalInputClass}
          />
        </Field>
        <Field label="メモ（任意）">
          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="例: ○○商会から仕入れ"
            className={modalInputClass}
          />
        </Field>
      </div>
      {error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}
      <ModalFooter
        onClose={onClose}
        busy={busy}
        onConfirm={handleSubmit}
        confirmLabel="入庫を記録"
      />
    </ModalShell>
  );
}

function StockAdjustModal({
  row,
  onClose,
  onDone,
}: {
  row: PartsInventory;
  onClose: () => void;
  onDone: () => void;
}) {
  const [newQty, setNewQty] = useState(String(row.stock_quantity));
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const delta = (() => {
    const n = Number(newQty);
    if (!Number.isFinite(n)) return null;
    return n - row.stock_quantity;
  })();

  async function handleSubmit() {
    const n = Number(newQty);
    if (!Number.isFinite(n) || n < 0) {
      setError("実在庫数は 0 以上の数値で入力してください。");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await adjustStock({
      part_id: row.id,
      new_quantity: n,
      memo: memo.trim() === "" ? null : memo.trim(),
    });
    setBusy(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    onDone();
  }

  return (
    <ModalShell
      title={`棚卸調整: ${row.name}`}
      onClose={busy ? undefined : onClose}
    >
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        現在の在庫: {row.stock_quantity}
        {row.unit ? ` ${row.unit}` : ""}
      </p>
      <div className="mt-3 space-y-3">
        <Field label="実際の在庫数" required>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.1"
            value={newQty}
            onChange={(e) => setNewQty(e.target.value)}
            className={modalInputClass}
          />
          {delta !== null && delta !== 0 && (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              差分: {delta > 0 ? `+${delta}` : delta}
            </p>
          )}
        </Field>
        <Field label="メモ（任意）">
          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="例: 棚卸"
            className={modalInputClass}
          />
        </Field>
      </div>
      {error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}
      <ModalFooter
        onClose={onClose}
        busy={busy}
        onConfirm={handleSubmit}
        confirmLabel="調整を記録"
      />
    </ModalShell>
  );
}

const modalInputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-50 dark:focus:ring-zinc-50";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label} {required && <span className="text-red-600">*</span>}
      </span>
      {children}
    </label>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {title}
        </h3>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

function ModalFooter({
  onClose,
  busy,
  onConfirm,
  confirmLabel,
}: {
  onClose: () => void;
  busy: boolean;
  onConfirm: () => void;
  confirmLabel: string;
}) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <button
        type="button"
        onClick={onClose}
        disabled={busy}
        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        キャンセル
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={busy}
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {busy ? "実行中..." : confirmLabel}
      </button>
    </div>
  );
}
