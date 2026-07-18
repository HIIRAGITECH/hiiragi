"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { formatYen } from "@/lib/format";
import type {
  PartCategory,
  PartsInventory,
  PartsInventoryVariant,
} from "@/lib/types";
import CategoryFilterTree, { UNCATEGORIZED } from "./category-filter-tree";
import {
  adjustStock,
  duplicatePart,
  registerStockIn,
  reorderParts,
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

type Props = {
  rows: PartsInventory[];
  includeDeleted?: boolean;
  // 二階建て化: 各部品にぶら下がる価格バリアント（全車種共通→車種別の順）。表示・検索に使う。
  variantsByPart?: Record<string, PartsInventoryVariant[]>;
  // 部品カテゴリ 段階3: テナントの全カテゴリ（左ツリー描画＋子孫解決用）。
  categories?: PartCategory[];
  // 選択中カテゴリ（URL ?category）。null=すべて表示 / "none"=未分類 / uuid=カテゴリ。
  selectedCategory?: string | null;
};

type StockDialog =
  | { kind: "in"; row: PartsInventory }
  | { kind: "adjust"; row: PartsInventory };

export default function PartsInventoryTable({
  rows,
  includeDeleted,
  variantsByPart = {},
  categories = [],
  selectedCategory = null,
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [onlyReorder, setOnlyReorder] = useState(false);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<StockDialog | null>(null);

  // 検索対象に、その部品にぶら下がる価格バリアントの社内品番も含める。
  const variantNumbersOf = (r: PartsInventory) =>
    (variantsByPart[r.id] ?? []).map((v) => v.part_number ?? "").join(" ");

  // ドラッグ&ドロップ並べ替え用のローカル順序。サーバー再取得（rows 変化）で同期する。
  const [items, setItems] = useState<PartsInventory[]>(rows);
  useEffect(() => {
    setItems(rows);
  }, [rows]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const reorderCount = useMemo(
    () =>
      rows.filter((r) => r.deleted_at === null && stockStatus(r) !== "ok")
        .length,
    [rows],
  );

  // 部品カテゴリ 段階3: 親→子のマップ（子孫解決＝方式② と件数バッジの共通土台）。
  const childrenOf = useMemo(() => {
    const map = new Map<string | null, PartCategory[]>();
    for (const c of categories) {
      const arr = map.get(c.parent_id) ?? [];
      arr.push(c);
      map.set(c.parent_id, arr);
    }
    return map;
  }, [categories]);

  // 選択カテゴリの「子孫id集合（自ノード含む）」。大分類を選ぶと配下の中・小すべてを含む。
  // すべて表示(null)・未分類("none")のときは集合を使わないので null。
  const descendantSet = useMemo(() => {
    if (!selectedCategory || selectedCategory === UNCATEGORIZED) return null;
    const set = new Set<string>();
    const walk = (id: string) => {
      set.add(id);
      for (const child of childrenOf.get(id) ?? []) walk(child.id);
    };
    walk(selectedCategory);
    return set;
  }, [selectedCategory, childrenOf]);

  // 件数バッジ（子孫含む）。母集合は表示中の行セット(rows=include_deleted 状態を尊重)。
  // 検索・発注フィルタには連動させない（登録件数の意味を保ち、クリックでちらつかせない）。
  const { countOf, noneCount } = useMemo(() => {
    const direct = new Map<string, number>();
    let noneCount = 0;
    for (const r of rows) {
      if (r.category_id) direct.set(r.category_id, (direct.get(r.category_id) ?? 0) + 1);
      else noneCount += 1;
    }
    const countOf = new Map<string, number>();
    const calc = (id: string): number => {
      let n = direct.get(id) ?? 0;
      for (const child of childrenOf.get(id) ?? []) n += calc(child.id);
      countOf.set(id, n);
      return n;
    };
    for (const root of childrenOf.get(null) ?? []) calc(root.id);
    return { countOf, noneCount };
  }, [rows, childrenOf]);

  const filtered = useMemo(() => {
    let list = rows;
    if (onlyReorder) list = list.filter((r) => stockStatus(r) !== "ok");
    // カテゴリ絞り込み（方式②の述語）。未分類は category_id IS NULL、それ以外は子孫集合に含む部品。
    if (selectedCategory === UNCATEGORIZED) {
      list = list.filter((r) => r.category_id === null);
    } else if (descendantSet) {
      list = list.filter((r) => r.category_id !== null && descendantSet.has(r.category_id));
    }
    const q = query.trim();
    if (q) {
      const needle = normalize(q);
      list = list.filter((r) =>
        normalize(
          `${r.name} ${r.supplier ?? ""} ${variantNumbersOf(r)} ${r.external_code ?? ""}`,
        ).includes(needle),
      );
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, query, onlyReorder, variantsByPart, selectedCategory, descendantSet]);

  // カテゴリ選択も「フィルタ中」に含める → 既存の「フィルタ中はDnD無効」「件数テキスト」判定が自動一致。
  const isFiltering =
    onlyReorder || query.trim().length > 0 || selectedCategory !== null;
  // 並べ替えはフィルタ解除かつ非表示を含めない通常表示のときのみ（保存中も一時無効）。
  const dndEnabled = !isFiltering && !includeDeleted;
  const canDrag = dndEnabled && !pending;
  const displayRows = dndEnabled ? items : filtered;

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldI = items.findIndex((x) => x.id === active.id);
    const newI = items.findIndex((x) => x.id === over.id);
    if (oldI < 0 || newI < 0) return;
    const next = arrayMove(items, oldI, newI);
    setItems(next);
    startTransition(async () => {
      await reorderParts(next.map((r) => r.id));
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
      <div className="flex flex-1 min-h-0">
        {/* 左: カテゴリツリー（カテゴリ未登録テナントは非表示＝従来どおり右一覧のみ）。 */}
        {categories.length > 0 && (
          <aside className="w-56 shrink-0 overflow-auto border-r border-[var(--color-line)] bg-[var(--color-paper)] px-4 py-4">
            <CategoryFilterTree
              categories={categories}
              selected={selectedCategory}
              countOf={countOf}
              allCount={rows.length}
              noneCount={noneCount}
            />
          </aside>
        )}

        {/* 右: 検索/フィルタ＋一覧（既存構造そのまま）。 */}
        <div className="flex flex-1 min-w-0 flex-col min-h-0">
          {/* 検索 + フィルタ */}
          <div className="border-b border-[var(--color-line)] bg-[var(--color-paper)] px-4 sm:px-8 py-4 flex flex-wrap items-center gap-4">
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
          {reorderCount > 0 && <span className="wos-ct">{reorderCount}</span>}
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
        <div className="px-4 sm:px-8 pt-4">
          <p className="wos-alert warn">⚠ 発注が必要: {reorderCount} 件</p>
        </div>
      )}

      <div className="flex-1 overflow-auto bg-[var(--color-cream)]">
        <div className="px-4 sm:px-8 py-6">
          {displayRows.length === 0 ? (
            <div className="wos-card text-center py-12 text-sm text-[var(--color-ink-light)]">
              {isFiltering
                ? "該当する部品が見つかりません。"
                : "部品が登録されていません。"}
            </div>
          ) : (
            <table className="w-full border-collapse bg-[var(--color-paper)] border border-[var(--color-line)]">
              <thead>
                <tr className="border-b-2 border-[var(--color-line-strong)] bg-[var(--color-cream)]">
                  <th className="wos-th w-10 text-center">並び</th>
                  <th className="wos-th">部品名</th>
                  <th className="wos-th right">原価</th>
                  <th className="wos-th right">在庫</th>
                  <th className="wos-th">状態</th>
                  <th className="wos-th right w-60">操作</th>
                </tr>
              </thead>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={displayRows.map((r) => r.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {displayRows.map((r) => (
                    <SortablePartBody
                      key={r.id}
                      r={r}
                      variants={variantsByPart[r.id] ?? []}
                      disabled={!canDrag}
                      busy={busy}
                      onStockIn={(row) => setDialog({ kind: "in", row })}
                      onAdjust={(row) => setDialog({ kind: "adjust", row })}
                      onDelete={handleDelete}
                      onRestore={handleRestore}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </table>
          )}
        </div>
        </div>
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

// 1部品 = 1 <tbody>（本体行＋ぶら下がり価格行）。<tbody> 単位でソート可能にする。
function SortablePartBody({
  r,
  variants,
  disabled,
  busy,
  onStockIn,
  onAdjust,
  onDelete,
  onRestore,
}: {
  r: PartsInventory;
  variants: PartsInventoryVariant[];
  disabled: boolean;
  busy: boolean;
  onStockIn: (row: PartsInventory) => void;
  onAdjust: (row: PartsInventory) => void;
  onDelete: (row: PartsInventory) => void;
  onRestore: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: r.id, disabled });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
    position: isDragging ? "relative" : undefined,
    zIndex: isDragging ? 10 : undefined,
  };
  const deleted = r.deleted_at !== null;
  const status = stockStatus(r);

  return (
    <tbody
      ref={setNodeRef}
      style={style}
      className={`border-b border-[var(--color-line)] ${
        deleted ? "opacity-50" : ""
      } ${isDragging ? "bg-[var(--color-cream)]" : "hover:bg-[var(--color-cream)]"}`}
    >
      <tr>
        <td className="wos-td text-center align-top">
          {disabled ? (
            <span
              className="select-none text-[var(--color-ink-light)] opacity-30"
              title="並べ替えはフィルタ解除・通常表示のときのみ"
            >
              ⠿
            </span>
          ) : (
            <button
              type="button"
              className="cursor-grab select-none text-[var(--color-ink-light)] hover:text-[var(--color-ink)] active:cursor-grabbing"
              aria-label="ドラッグして並べ替え"
              {...attributes}
              {...listeners}
            >
              ⠿
            </button>
          )}
        </td>
        <td className="wos-td align-top">
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
          {r.external_code && (
            <div className="mt-0.5 text-xs text-[var(--color-ink-light)]">
              仕入れ品番: {r.external_code}
            </div>
          )}
          {r.supplier && (
            <div className="mt-0.5 text-xs text-[var(--color-ink-light)]">
              仕入先: {r.supplier}
            </div>
          )}
        </td>
        <td className="wos-td num right align-top">{formatYen(r.cost_price)}</td>
        <td className="wos-td num right font-semibold align-top">
          {r.stock_quantity}
          {r.unit ? (
            <span className="ml-0.5 text-xs font-normal text-[var(--color-ink-light)]">
              {r.unit}
            </span>
          ) : null}
        </td>
        <td className="wos-td align-top">
          <StatusBadge status={status} />
        </td>
        <td className="wos-td align-top">
          {deleted ? (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => onRestore(r.id)}
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
                onClick={() => onStockIn(r)}
                disabled={busy}
                className="wos-btn wos-btn-xs"
              >
                入庫
              </button>
              <button
                type="button"
                onClick={() => onAdjust(r)}
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
                <button type="submit" className="wos-btn-ghost wos-btn-xs">
                  複製
                </button>
              </form>
              <button
                type="button"
                onClick={() => onDelete(r)}
                disabled={busy}
                className="wos-btn-danger wos-btn-xs"
              >
                削除
              </button>
            </div>
          )}
        </td>
      </tr>
      {/* ぶら下がり価格（表示のみ・編集は編集画面で）。 */}
      <tr>
        <td className="border-b border-[var(--color-line)]" />
        <td
          colSpan={5}
          className="border-b border-[var(--color-line)] px-3 pb-2 pt-0"
        >
          <PriceHangers variants={variants} />
        </td>
      </tr>
    </tbody>
  );
}

// 部品にぶら下がる価格の小さなリスト。全車種共通（車種空）→ 車種別。表示のみ。
function PriceHangers({ variants }: { variants: PartsInventoryVariant[] }) {
  if (variants.length === 0) {
    return (
      <span className="text-xs text-[var(--color-ink-light)]">価格未設定</span>
    );
  }
  return (
    <div className="flex flex-col gap-0.5">
      {variants.map((v) => {
        const isGeneral = v.vehicle_tags.length === 0;
        const bulk =
          v.list_price != null && v.markup_rate != null
            ? Math.round(v.list_price * v.markup_rate)
            : null;
        return (
          <div
            key={v.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--color-ink-mid)]"
          >
            <span
              className={`inline-block min-w-[7rem] ${
                isGeneral
                  ? "font-medium text-[var(--color-ink)]"
                  : "text-[var(--color-ink)]"
              }`}
            >
              {isGeneral ? "全車種共通" : v.vehicle_tags.join("・")}
            </span>
            <span className="text-[var(--color-ink-light)]">
              社内 {v.part_number ?? "—"}
            </span>
            <span>
              定価 {v.list_price != null ? formatYen(v.list_price) : "—"}
            </span>
            <span>
              掛率{" "}
              {v.markup_rate != null
                ? `${Math.round(v.markup_rate * 1000) / 10}%`
                : "—"}
            </span>
            <span>業販 {bulk != null ? formatYen(bulk) : "—"}</span>
          </div>
        );
      })}
    </div>
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
