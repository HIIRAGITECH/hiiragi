"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import SearchInput from "@/lib/components/search-input";
import { formatYen } from "@/lib/format";
import type { WorkCategory, WorkMenuItem, WorkMenuSet } from "@/lib/types";
import type { FormState } from "./actions";

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  initial?: WorkMenuSet;
  initialMenuItemIds: string[];
  allMenus: WorkMenuItem[];
  submitLabel: string;
  cancelHref: string;
};

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-50 dark:focus:ring-zinc-50";

const labelClass =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";

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
  allMenus,
  submitLabel,
  cancelHref,
}: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    undefined,
  );
  const [selectedIds, setSelectedIds] = useState<string[]>(initialMenuItemIds);
  const [pickerOpen, setPickerOpen] = useState(false);

  const menuMap = useMemo(() => {
    const m = new Map<string, WorkMenuItem>();
    for (const it of allMenus) m.set(it.id, it);
    return m;
  }, [allMenus]);

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

  return (
    <form action={formAction} className="space-y-4">
      <input
        type="hidden"
        name="menu_item_ids_json"
        value={JSON.stringify(selectedIds)}
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
            含まれる作業メニュー <span className="text-red-600">*</span>
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

      {state?.error && (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {pending ? "保存中..." : submitLabel}
        </button>
        <Link
          href={cancelHref}
          className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
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
