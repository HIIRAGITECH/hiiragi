"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import SearchInput from "@/lib/components/search-input";
import { formatYen } from "@/lib/format";
import type {
  PartsInventory,
  WorkCategory,
  WorkMenuItem,
  WorkMenuSet,
} from "@/lib/types";
import type { FormState } from "./actions";

// セットに含める部品 1 件（part_id ＋ quantity）。価格は受注展開時に解決するのでここでは持たない。
export type SetPartRow = { part_id: string; quantity: number };

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  initial?: WorkMenuSet;
  initialMenuItemIds: string[];
  initialParts: SetPartRow[];
  allMenus: WorkMenuItem[];
  allParts: PartsInventory[];
  submitLabel: string;
  cancelHref: string;
};

const inputClass = "wos-input";
const labelClass = "wos-label";

const CATEGORY_LABEL: Record<WorkCategory, string> = {
  normal: "整備",
  shaken: "車検（課税）",
  shaken_tax_free: "車検（非課税）",
};

function menuTotal(m: WorkMenuItem): number {
  return m.default_labor_cost > 0 || m.default_parts_cost > 0
    ? m.default_labor_cost + m.default_parts_cost
    : m.default_unit_price;
}

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFKC");
}

export default function WorkMenuSetForm({
  action,
  initial,
  initialMenuItemIds,
  initialParts,
  allMenus,
  allParts,
  submitLabel,
  cancelHref,
}: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    undefined,
  );
  const [selectedIds, setSelectedIds] = useState<string[]>(initialMenuItemIds);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedParts, setSelectedParts] =
    useState<SetPartRow[]>(initialParts);
  const [partPickerOpen, setPartPickerOpen] = useState(false);

  const menuMap = useMemo(() => {
    const m = new Map<string, WorkMenuItem>();
    for (const it of allMenus) m.set(it.id, it);
    return m;
  }, [allMenus]);

  const partMap = useMemo(() => {
    const m = new Map<string, PartsInventory>();
    for (const p of allParts) m.set(p.id, p);
    return m;
  }, [allParts]);

  const selectedItems = useMemo(
    () =>
      selectedIds
        .map((id) => menuMap.get(id))
        .filter((m): m is WorkMenuItem => !!m),
    [selectedIds, menuMap],
  );

  const totalAmount = useMemo(
    () => selectedItems.reduce((sum, m) => sum + menuTotal(m), 0),
    [selectedItems],
  );

  function move(idx: number, direction: "up" | "down") {
    setSelectedIds((prev) => {
      const next = [...prev];
      const j = direction === "up" ? idx - 1 : idx + 1;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }

  function remove(idx: number) {
    setSelectedIds((prev) => prev.filter((_, i) => i !== idx));
  }

  function addIds(ids: string[]) {
    setSelectedIds((prev) => [...prev, ...ids]);
    setPickerOpen(false);
  }

  // --- 部品セクションの操作 ---
  function movePart(idx: number, direction: "up" | "down") {
    setSelectedParts((prev) => {
      const next = [...prev];
      const j = direction === "up" ? idx - 1 : idx + 1;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }

  function removePart(idx: number) {
    setSelectedParts((prev) => prev.filter((_, i) => i !== idx));
  }

  function setPartQuantity(idx: number, value: string) {
    const qty = Number(value);
    setSelectedParts((prev) =>
      prev.map((p, i) =>
        i === idx
          ? { ...p, quantity: Number.isFinite(qty) && qty > 0 ? qty : p.quantity }
          : p,
      ),
    );
  }

  function addPartIds(ids: string[]) {
    // 既に入っている部品は重複追加しない（数量で調整してもらう）。
    setSelectedParts((prev) => {
      const have = new Set(prev.map((p) => p.part_id));
      const fresh = ids
        .filter((id) => !have.has(id))
        .map((id) => ({ part_id: id, quantity: 1 }));
      return [...prev, ...fresh];
    });
    setPartPickerOpen(false);
  }

  return (
    <form action={formAction} className="wos-card space-y-5">
      <input
        type="hidden"
        name="menu_item_ids_json"
        value={JSON.stringify(selectedIds)}
      />
      <input
        type="hidden"
        name="part_items_json"
        value={JSON.stringify(selectedParts)}
      />

      <div>
        <label htmlFor="name" className={labelClass}>
          セット名 <span className="text-red-600">*</span>
        </label>
        <input
          id="name"
          name="name"
          required
          defaultValue={initial?.name ?? ""}
          className={inputClass}
          placeholder="例: 12 ヶ月点検 標準セット"
        />
      </div>

      <div>
        <label htmlFor="memo" className={labelClass}>
          メモ <span className="text-xs text-zinc-500">（任意）</span>
        </label>
        <textarea
          id="memo"
          name="memo"
          rows={2}
          defaultValue={initial?.memo ?? ""}
          className={inputClass}
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className={labelClass}>
            含まれる作業メニュー{" "}
            <span className="text-xs text-zinc-500">（部品と合わせて1つ以上）</span>
          </span>
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            合計: <span className="font-medium">{formatYen(totalAmount)}</span>
            <span className="ml-2 text-xs text-zinc-500">
              ({selectedItems.length} 件)
            </span>
          </span>
        </div>

        <div className="overflow-hidden rounded-md border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
          {selectedItems.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
              まだメニューが追加されていません。下の「＋ 作業メニューを追加」を押してください。
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-white text-left text-xs uppercase tracking-wider text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <th className="w-16 px-2 py-2 text-center font-medium">
                    並び
                  </th>
                  <th className="px-2 py-2 font-medium">作業内容</th>
                  <th className="px-2 py-2 font-medium">部品名</th>
                  <th className="px-2 py-2 font-medium">区分</th>
                  <th className="px-2 py-2 text-right font-medium">合計</th>
                  <th className="w-12 px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {selectedItems.map((m, idx) => (
                  <tr key={`${m.id}-${idx}`}>
                    <td className="px-2 py-2 text-center">
                      <div className="flex justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => move(idx, "up")}
                          disabled={idx === 0}
                          aria-label="上に"
                          className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs text-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => move(idx, "down")}
                          disabled={idx === selectedItems.length - 1}
                          aria-label="下に"
                          className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs text-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                        >
                          ↓
                        </button>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-zinc-900 dark:text-zinc-50">
                      {m.work_name}
                    </td>
                    <td className="px-2 py-2 text-zinc-600 dark:text-zinc-400">
                      {m.part_name ?? "—"}
                    </td>
                    <td className="px-2 py-2 text-zinc-600 dark:text-zinc-400">
                      {CATEGORY_LABEL[m.category]}
                    </td>
                    <td className="px-2 py-2 text-right text-zinc-900 dark:text-zinc-50">
                      {formatYen(menuTotal(m))}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => remove(idx)}
                        aria-label="行を削除"
                        className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs text-zinc-600 hover:text-red-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-red-400"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="mt-2 w-full rounded-md border border-dashed border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-700 transition-colors hover:border-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:bg-zinc-800"
        >
          ＋ 作業メニューを追加
        </button>
      </div>

      {/* 部品セクション（案2）。価格は受注展開時にその受注の車種で解決するので、
          ここでは部品と数量だけを持つ。定価は目安として表示する。 */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className={labelClass}>
            含まれる部品{" "}
            <span className="text-xs text-zinc-500">（任意）</span>
          </span>
          <span className="text-xs text-zinc-500">
            {selectedParts.length} 件
          </span>
        </div>

        <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
          価格は受注でセットを展開するとき、その車両に合わせて自動計算されます（法人は業販、個人は定価）。
        </p>

        <div className="overflow-hidden rounded-md border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
          {selectedParts.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
              部品は追加されていません。下の「＋ 部品を追加」から選べます。
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-white text-left text-xs uppercase tracking-wider text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <th className="w-16 px-2 py-2 text-center font-medium">
                    並び
                  </th>
                  <th className="px-2 py-2 font-medium">部品名</th>
                  <th className="px-2 py-2 text-right font-medium">定価(目安)</th>
                  <th className="w-24 px-2 py-2 text-center font-medium">数量</th>
                  <th className="w-12 px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {selectedParts.map((sp, idx) => {
                  const p = partMap.get(sp.part_id);
                  return (
                    <tr key={`${sp.part_id}-${idx}`}>
                      <td className="px-2 py-2 text-center">
                        <div className="flex justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => movePart(idx, "up")}
                            disabled={idx === 0}
                            aria-label="上に"
                            className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs text-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => movePart(idx, "down")}
                            disabled={idx === selectedParts.length - 1}
                            aria-label="下に"
                            className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs text-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                          >
                            ↓
                          </button>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-zinc-900 dark:text-zinc-50">
                        {p ? p.name : "（削除された部品）"}
                      </td>
                      <td className="px-2 py-2 text-right text-zinc-600 dark:text-zinc-400">
                        {p && p.sale_price != null
                          ? formatYen(p.sale_price)
                          : "—"}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={sp.quantity}
                          onChange={(e) => setPartQuantity(idx, e.target.value)}
                          className="w-16 rounded border border-zinc-300 bg-white px-2 py-1 text-right text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                        />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => removePart(idx)}
                          aria-label="行を削除"
                          className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs text-zinc-600 hover:text-red-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-red-400"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <button
          type="button"
          onClick={() => setPartPickerOpen(true)}
          className="mt-2 w-full rounded-md border border-dashed border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-700 transition-colors hover:border-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:bg-zinc-800"
        >
          ＋ 部品を追加
        </button>
      </div>

      {state?.error && (
        <p role="alert" className="wos-alert warn">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="wos-btn wos-btn-sm"
        >
          {pending ? "保存中…" : submitLabel}
        </button>
        <Link href={cancelHref} className="wos-btn-ghost wos-btn-sm">
          キャンセル
        </Link>
      </div>

      {pickerOpen && (
        <MenuPicker
          allMenus={allMenus}
          onConfirm={addIds}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {partPickerOpen && (
        <PartPicker
          allParts={allParts}
          alreadyPicked={new Set(selectedParts.map((p) => p.part_id))}
          onConfirm={addPartIds}
          onClose={() => setPartPickerOpen(false)}
        />
      )}
    </form>
  );
}

function MenuPicker({
  allMenus,
  onConfirm,
  onClose,
}: {
  allMenus: WorkMenuItem[];
  onConfirm: (ids: string[]) => void;
  onClose: () => void;
}) {
  type Filter = "all" | WorkCategory;
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    let list = allMenus;
    if (filter !== "all") list = list.filter((m) => m.category === filter);
    const q = query.trim();
    if (q) {
      const needle = normalize(q);
      list = list.filter((m) =>
        normalize(`${m.work_name} ${m.part_name ?? ""}`).includes(needle),
      );
    }
    return list;
  }, [allMenus, filter, query]);

  function togglePick(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            作業メニューを追加
          </h3>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {(
              [
                ["all", "すべて"],
                ["normal", "整備"],
                ["shaken", "車検課税"],
                ["shaken_tax_free", "車検非課税"],
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                type="button"
                onClick={() => setFilter(v)}
                className={`rounded-full px-3 py-1 text-xs transition-colors ${
                  filter === v
                    ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                    : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                }`}
              >
                {l}
              </button>
            ))}
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="検索"
              className="ml-auto w-56"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
              該当する作業メニューがありません。
            </p>
          ) : (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {filtered.map((m) => (
                <li key={m.id} className="px-4 py-2">
                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={picked.has(m.id)}
                      onChange={() => togglePick(m.id)}
                    />
                    <div className="flex-1">
                      <div className="text-sm text-zinc-900 dark:text-zinc-50">
                        {m.work_name}
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">
                        {CATEGORY_LABEL[m.category]}
                        {m.part_name ? ` / ${m.part_name}` : ""}
                      </div>
                    </div>
                    <div className="text-sm text-zinc-700 dark:text-zinc-300">
                      {formatYen(menuTotal(m))}
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            選択中: {picked.size} 件
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              キャンセル
            </button>
            <button
              type="button"
              disabled={picked.size === 0}
              onClick={() => onConfirm(Array.from(picked))}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              追加
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// 部品ピッカー。受注の PartPickerModal に相当するが、セット登録時は車両が無いので
// 価格解決（variant）はせず、part_id を選ぶだけ。数量は追加後に本体側で入力する。
// すでにセットに入っている部品はチェック不可（重複防止）。
function PartPicker({
  allParts,
  alreadyPicked,
  onConfirm,
  onClose,
}: {
  allParts: PartsInventory[];
  alreadyPicked: Set<string>;
  onConfirm: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return allParts;
    const needle = normalize(q);
    return allParts.filter((p) =>
      normalize(
        `${p.name} ${p.internal_code ?? ""} ${p.external_code ?? ""}`,
      ).includes(needle),
    );
  }, [allParts, query]);

  function togglePick(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            部品を追加
          </h3>
          <div className="mt-3">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="部品名・品番で検索"
              className="w-full"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {allParts.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
              明細に出せる部品が未登録です。「部品在庫」画面で登録してください。
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
              該当する部品がありません。
            </p>
          ) : (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {filtered.map((p) => {
                const disabled = alreadyPicked.has(p.id);
                return (
                  <li key={p.id} className="px-4 py-2">
                    <label
                      className={`flex items-center gap-3 ${
                        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={disabled}
                        checked={disabled || picked.has(p.id)}
                        onChange={() => togglePick(p.id)}
                      />
                      <div className="flex-1">
                        <div className="text-sm text-zinc-900 dark:text-zinc-50">
                          {p.name}
                          {disabled && (
                            <span className="ml-2 text-xs text-zinc-400">
                              追加済み
                            </span>
                          )}
                        </div>
                        {(p.internal_code || p.external_code) && (
                          <div className="text-xs text-zinc-500 dark:text-zinc-400">
                            {p.internal_code ?? p.external_code}
                          </div>
                        )}
                      </div>
                      <div className="text-sm text-zinc-700 dark:text-zinc-300">
                        {p.sale_price != null ? formatYen(p.sale_price) : "—"}
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            選択中: {picked.size} 件
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              キャンセル
            </button>
            <button
              type="button"
              disabled={picked.size === 0}
              onClick={() => onConfirm(Array.from(picked))}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              追加
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
