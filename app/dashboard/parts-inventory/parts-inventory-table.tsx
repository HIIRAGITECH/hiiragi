"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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

type StockStatus = "out" | "low" | "ok";
function stockStatus(r: PartsInventory): StockStatus {
  if (r.stock_quantity <= 0) return "out";
  if (r.stock_quantity <= r.reorder_point) return "low";
  return "ok";
}

// 二階建て化（2026-06-24）: 社内品番・定価は標準（汎用）バリアント由来。
// part_id → {社内品番, 定価}。未収載の旧行は本体 internal_code/sale_price でフォールバック。
type GeneralInfo = { part_number: string | null; list_price: number | null };

type Props = {
  rows: PartsInventory[];
  includeDeleted?: boolean;
  generalByPart?: Record<string, GeneralInfo>;
};

type StockDialog =
  | { kind: "in"; row: PartsInventory }
  | { kind: "adjust"; row: PartsInventory };

export default function PartsInventoryTable({
  rows,
  includeDeleted,
  generalByPart = {},
}: Props) {
  // 社内品番・定価は標準バリアント優先、無ければ本体の旧2列にフォールバック。
  const internalCodeOf = (r: PartsInventory) =>
    generalByPart[r.id]?.part_number ?? r.internal_code ?? null;
  const listPriceOf = (r: PartsInventory) =>
    generalByPart[r.id]?.list_price ?? r.sale_price ?? null;
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [onlyReorder, setOnlyReorder] = useState(false);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<StockDialog | null>(null);

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
          `${r.name} ${r.supplier ?? ""} ${internalCodeOf(r) ?? ""} ${r.external_code ?? ""}`,
        ).includes(needle),
      );
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, query, onlyReorder, generalByPart]);

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
      {/* 検索 + フィルタ */}
      <div className="border-b border-[var(--color-line)] bg-[var(--color-paper)] px-8 py-4 flex flex-wrap items-center gap-4">
        <div className="wos-search max-w-[480px]">
          <span className="wos-ico">⌕</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="部品名・品番・仕入先で検索…"
          />
        </div>
        <span className="text-xs text-[var(--color-ink-light)] tracking-widest">
          {isFiltering
            ? `${rows.length} 件中 ${filtered.length} 件`
            : `登録件数 ${rows.length} 件`}
        </span>
        <span
          className={`wos-chip ${onlyReorder ? "active" : ""}`}
          onClick={() => setOnlyReorder((v) => !v)}
        >
          発注が必要なものだけ
          {reorderCount > 0 && (
            <span className="wos-ct">{reorderCount}</span>
          )}
        </span>
        <label className="text-xs text-[var(--color-ink-mid)] flex items-center gap-2 ml-auto cursor-pointer">
          <input
            type="checkbox"
            checked={!!includeDeleted}
            onChange={(e) => {
              const url = new URL(window.location.href);
              if (e.target.checked) url.searchParams.set("include_deleted", "1");
              else url.searchParams.delete("include_deleted");
              router.push(url.pathname + url.search);
            }}
          />
          非表示を含める
        </label>
      </div>

      {reorderCount > 0 && !includeDeleted && (
        <div className="px-8 pt-4">
          <p className="wos-alert warn">
            ⚠ 発注が必要: {reorderCount} 件
          </p>
        </div>
      )}

      <div className="flex-1 overflow-auto bg-[var(--color-cream)]">
        <div className="px-8 py-6">
          {filtered.length === 0 ? (
            <div className="wos-card text-center py-12 text-sm text-[var(--color-ink-light)]">
              {isFiltering
                ? "該当する部品が見つかりません。"
                : "部品が登録されていません。"}
            </div>
          ) : (
            <table className="w-full border-collapse bg-[var(--color-paper)] border border-[var(--color-line)]">
              <thead>
                <tr className="border-b-2 border-[var(--color-line-strong)] bg-[var(--color-cream)]">
                  <th className="wos-th w-16 text-center">並び</th>
                  <th className="wos-th">部品名</th>
                  <th className="wos-th right">原価</th>
                  <th className="wos-th right">定価</th>
                  <th className="wos-th right">在庫</th>
                  <th className="wos-th right">発注点</th>
                  <th className="wos-th">明細</th>
                  <th className="wos-th">状態</th>
                  <th className="wos-th right w-60">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, idx) => {
                  const status = stockStatus(r);
                  const deleted = r.deleted_at !== null;
                  return (
                    <tr
                      key={r.id}
                      className={`border-b border-[var(--color-line)] hover:bg-[var(--color-cream)] ${
                        deleted ? "opacity-50" : ""
                      }`}
                    >
                      <td className="wos-td text-center align-top">
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
                            className="wos-btn-ghost wos-btn-xs"
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
                            className="wos-btn-ghost wos-btn-xs"
                          >
                            ↓
                          </button>
                        </div>
                      </td>
                      <td className="wos-td">
                        {deleted ? (
                          <span className="font-semibold">{r.name}</span>
                        ) : (
                          <Link
                            href={`/dashboard/parts-inventory/${r.id}/edit`}
                            className="font-semibold text-[var(--color-ink)] hover:underline"
                          >
                            {r.name}
                          </Link>
                        )}
                        {deleted && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 border border-[var(--color-line)] text-[var(--color-ink-light)]">
                            非表示
                          </span>
                        )}
                        {(internalCodeOf(r) || r.external_code) && (
                          <div className="mt-0.5 text-xs text-[var(--color-ink-light)]">
                            {internalCodeOf(r) && <>社内: {internalCodeOf(r)}</>}
                            {internalCodeOf(r) && r.external_code && " / "}
                            {r.external_code && <>社外: {r.external_code}</>}
                          </div>
                        )}
                        {r.supplier && (
                          <div className="mt-0.5 text-xs text-[var(--color-ink-light)]">
                            仕入先: {r.supplier}
                          </div>
                        )}
                      </td>
                      <td className="wos-td num right">
                        {formatYen(r.cost_price)}
                      </td>
                      <td className="wos-td num right">
                        {listPriceOf(r) != null ? formatYen(listPriceOf(r)!) : "—"}
                      </td>
                      <td className="wos-td num right font-semibold">
                        {r.stock_quantity}
                        {r.unit ? (
                          <span className="ml-0.5 text-xs font-normal text-[var(--color-ink-light)]">
                            {r.unit}
                          </span>
                        ) : null}
                      </td>
                      <td className="wos-td num right">{r.reorder_point}</td>
                      <td className="wos-td">
                        {r.show_in_detail ? (
                          <span className="text-[10px] text-[var(--color-ink-mid)]">
                            出す
                          </span>
                        ) : (
                          <span
                            className="text-[10px] text-[var(--color-warn)]"
                            title="間接材料: 明細には出さず工賃に含む扱い"
                          >
                            間接材料
                          </span>
                        )}
                      </td>
                      <td className="wos-td">
                        <StatusBadge status={status} />
                      </td>
                      <td className="wos-td">
                        {deleted ? (
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => handleRestore(r.id)}
                              disabled={busy}
                              className="wos-btn-ghost wos-btn-xs"
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
                              className="wos-btn wos-btn-xs"
                            >
                              入庫
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setDialog({ kind: "adjust", row: r })
                              }
                              disabled={busy}
                              className="wos-btn-ghost wos-btn-xs"
                            >
                              棚卸
                            </button>
                            <Link
                              href={`/dashboard/parts-inventory/${r.id}/edit`}
                              className="wos-btn-ghost wos-btn-xs"
                            >
                              編集
                            </Link>
                            <form action={duplicatePart}>
                              <input type="hidden" name="id" value={r.id} />
                              <button
                                type="submit"
                                className="wos-btn-ghost wos-btn-xs"
                              >
                                複製
                              </button>
                            </form>
                            <button
                              type="button"
                              onClick={() => handleDelete(r)}
                              disabled={busy}
                              className="wos-btn-danger wos-btn-xs"
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
    return <span className="wos-status over">欠品</span>;
  }
  if (status === "low") {
    return <span className="wos-status over">発注</span>;
  }
  return <span className="wos-status w-k">在庫OK</span>;
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
    <ModalShell title={`入庫登録: ${row.name}`} onClose={busy ? undefined : onClose}>
      <p className="text-xs text-[var(--color-ink-light)]">
        現在の在庫: {row.stock_quantity}
        {row.unit ? ` ${row.unit}` : ""}
      </p>
      <div className="mt-3 space-y-3">
        <ModalField label="入庫数" required>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={1}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="wos-input"
          />
        </ModalField>
        <ModalField label="単価（仕入値、任意）">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={unitCost}
            onChange={(e) => setUnitCost(e.target.value)}
            className="wos-input"
          />
        </ModalField>
        <ModalField label="メモ（任意）">
          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="例: ○○商会から仕入れ"
            className="wos-input"
          />
        </ModalField>
      </div>
      {error && <p className="wos-alert warn mt-3">{error}</p>}
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
    <ModalShell title={`棚卸調整: ${row.name}`} onClose={busy ? undefined : onClose}>
      <p className="text-xs text-[var(--color-ink-light)]">
        現在の在庫: {row.stock_quantity}
        {row.unit ? ` ${row.unit}` : ""}
      </p>
      <div className="mt-3 space-y-3">
        <ModalField label="実際の在庫数" required>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={1}
            value={newQty}
            onChange={(e) => setNewQty(e.target.value)}
            className="wos-input"
          />
          {delta !== null && delta !== 0 && (
            <p className="mt-1 text-xs text-[var(--color-ink-light)]">
              差分: {delta > 0 ? `+${delta}` : delta}
            </p>
          )}
        </ModalField>
        <ModalField label="メモ（任意）">
          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="例: 棚卸"
            className="wos-input"
          />
        </ModalField>
      </div>
      {error && <p className="wos-alert warn mt-3">{error}</p>}
      <ModalFooter
        onClose={onClose}
        busy={busy}
        onConfirm={handleSubmit}
        confirmLabel="調整を記録"
      />
    </ModalShell>
  );
}

function ModalField({
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
      <span className="wos-label">
        {label}
        {required && <span className="wos-req">*</span>}
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
        className="w-full max-w-md bg-[var(--color-paper)] p-5 border border-[var(--color-line-strong)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          className="text-base font-semibold text-[var(--color-ink)]"
          style={{ letterSpacing: "0.04em" }}
        >
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
        className="wos-btn-ghost wos-btn-sm"
      >
        キャンセル
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={busy}
        className="wos-btn wos-btn-sm"
      >
        {busy ? "実行中…" : confirmLabel}
      </button>
    </div>
  );
}
