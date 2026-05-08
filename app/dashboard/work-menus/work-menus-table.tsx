"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import SearchInput from "@/lib/components/search-input";
import { formatYen } from "@/lib/format";
import type { WorkCategory, WorkMenuItem } from "@/lib/types";
import {
  deleteWorkMenu,
  duplicateWorkMenu,
  moveWorkMenu,
} from "./actions";

const CATEGORY_LABEL: Record<WorkCategory, string> = {
  normal: "整備",
  shaken: "車検（課税）",
  shaken_tax_free: "車検（非課税）",
};

type Filter = "all" | WorkCategory;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "normal", label: "整備" },
  { value: "shaken", label: "車検課税" },
  { value: "shaken_tax_free", label: "車検非課税" },
];

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFKC");
}

type Props = {
  rows: WorkMenuItem[];
};

export default function WorkMenusTable({ rows }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    let list = rows;
    if (filter !== "all") list = list.filter((r) => r.category === filter);
    const q = query.trim();
    if (q) {
      const needle = normalize(q);
      list = list.filter((r) =>
        normalize(`${r.work_name} ${r.part_name ?? ""}`).includes(needle),
      );
    }
    return list;
  }, [rows, filter, query]);

  const isFiltering = filter !== "all" || query.trim().length > 0;

  function handleMove(id: string, direction: "up" | "down") {
    startTransition(async () => {
      await moveWorkMenu(id, direction);
      router.refresh();
    });
  }

  return (
    <>
      <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {isFiltering
            ? `${rows.length} 件中 ${filtered.length} 件表示`
            : `登録件数: ${rows.length} 件`}
        </p>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="作業内容・部品名で検索"
          className="w-full sm:w-80"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded-full px-3 py-1 text-xs transition-colors ${
              filter === f.value
                ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
            {isFiltering
              ? "該当する作業メニューが見つかりません。"
              : "作業メニューが登録されていません。"}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wider text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
              <tr>
                <th className="w-20 px-2 py-3 text-center font-medium">並び</th>
                <th className="px-3 py-3 font-medium">作業内容</th>
                <th className="px-3 py-3 font-medium">部品名</th>
                <th className="px-3 py-3 font-medium">カテゴリ</th>
                <th className="px-3 py-3 text-right font-medium">工賃</th>
                <th className="px-3 py-3 text-right font-medium">部品代</th>
                <th className="px-3 py-3 text-right font-medium">合計</th>
                <th className="w-44 px-3 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {filtered.map((r, idx) => {
                const total =
                  r.default_labor_cost > 0 || r.default_parts_cost > 0
                    ? r.default_labor_cost + r.default_parts_cost
                    : r.default_unit_price;
                return (
                  <tr
                    key={r.id}
                    className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  >
                    <td className="px-2 py-3 text-center align-top">
                      <div className="flex justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleMove(r.id, "up")}
                          disabled={pending || idx === 0 || isFiltering}
                          aria-label="上に移動"
                          title={
                            isFiltering
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
                            pending || idx === filtered.length - 1 || isFiltering
                          }
                          aria-label="下に移動"
                          title={
                            isFiltering
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
                      <Link
                        href={`/dashboard/work-menus/${r.id}/edit`}
                        className="hover:underline"
                      >
                        {r.work_name}
                      </Link>
                    </td>
                    <td className="px-3 py-3 align-top text-zinc-600 dark:text-zinc-400">
                      {r.part_name ?? "—"}
                    </td>
                    <td className="px-3 py-3 align-top text-zinc-600 dark:text-zinc-400">
                      {CATEGORY_LABEL[r.category]}
                      {r.tax_free && (
                        <span className="ml-1 rounded bg-zinc-100 px-1 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                          非課税
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right align-top text-zinc-700 dark:text-zinc-300">
                      {r.default_labor_cost > 0
                        ? formatYen(r.default_labor_cost)
                        : "—"}
                    </td>
                    <td className="px-3 py-3 text-right align-top text-zinc-700 dark:text-zinc-300">
                      {r.default_parts_cost > 0
                        ? formatYen(r.default_parts_cost)
                        : "—"}
                    </td>
                    <td className="px-3 py-3 text-right align-top font-medium text-zinc-900 dark:text-zinc-50">
                      {formatYen(total)}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="flex justify-end gap-1">
                        <Link
                          href={`/dashboard/work-menus/${r.id}/edit`}
                          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          編集
                        </Link>
                        <form action={duplicateWorkMenu}>
                          <input type="hidden" name="id" value={r.id} />
                          <button
                            type="submit"
                            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                          >
                            複製
                          </button>
                        </form>
                        <form
                          action={deleteWorkMenu}
                          onSubmit={(e) => {
                            if (
                              !confirm(
                                `「${r.work_name}」を削除します。よろしいですか？\n（作業セットで使用中の場合は削除できません）`,
                              )
                            ) {
                              e.preventDefault();
                            }
                          }}
                        >
                          <input type="hidden" name="id" value={r.id} />
                          <button
                            type="submit"
                            className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs text-red-600 transition-colors hover:bg-red-50 dark:border-red-900 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950"
                          >
                            削除
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
