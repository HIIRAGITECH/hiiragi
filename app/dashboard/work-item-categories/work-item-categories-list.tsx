"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import SearchInput from "@/lib/components/search-input";
import type { WorkItemCategory } from "@/lib/types";
import {
  moveWorkItemCategory,
  restoreWorkItemCategory,
  softDeleteWorkItemCategory,
} from "./actions";

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFKC");
}

type Props = {
  rows: WorkItemCategory[];
  includeDeleted?: boolean;
};

export default function WorkItemCategoriesList({ rows, includeDeleted }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return rows;
    const needle = normalize(q);
    return rows.filter((r) => normalize(r.name).includes(needle));
  }, [rows, query]);

  const isFiltering = query.trim().length > 0;

  function handleMove(id: string, direction: "up" | "down") {
    startTransition(async () => {
      await moveWorkItemCategory(id, direction);
      router.refresh();
    });
  }

  async function handleDelete(row: WorkItemCategory) {
    if (
      !confirm(
        `カテゴリ「${row.name}」を非表示にします。よろしいですか？\n（後から「非表示を含める」で復元できます）`,
      )
    ) {
      return;
    }
    setBusy(true);
    const r = await softDeleteWorkItemCategory(row.id);
    setBusy(false);
    if ("error" in r) alert(r.error);
    else router.refresh();
  }

  async function handleRestore(id: string) {
    setBusy(true);
    const r = await restoreWorkItemCategory(id);
    setBusy(false);
    if ("error" in r) alert(r.error);
    else router.refresh();
  }

  function toggleIncludeDeleted(checked: boolean) {
    const url = new URL(window.location.href);
    if (checked) url.searchParams.set("include_deleted", "1");
    else url.searchParams.delete("include_deleted");
    router.push(url.pathname + url.search);
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
          placeholder="カテゴリ名で検索"
          className="w-full sm:w-80"
        />
      </div>

      <div className="mt-3 flex items-center justify-end">
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={!!includeDeleted}
            onChange={(e) => toggleIncludeDeleted(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900"
          />
          非表示を含める
        </label>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
            {isFiltering
              ? "該当するカテゴリが見つかりません。"
              : "カテゴリが登録されていません。"}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wider text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
              <tr>
                <th className="w-20 px-2 py-3 text-center font-medium">並び</th>
                <th className="px-3 py-3 font-medium">カテゴリ名</th>
                <th className="w-24 px-3 py-3 text-right font-medium">並び順</th>
                <th className="w-44 px-3 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {filtered.map((r, idx) => {
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
                              ? "非表示のカテゴリは並び替えできません"
                              : isFiltering
                                ? "並び替えは検索解除時のみ"
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
                              ? "非表示のカテゴリは並び替えできません"
                              : isFiltering
                                ? "並び替えは検索解除時のみ"
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
                          href={`/dashboard/work-item-categories/${r.id}/edit`}
                          className="hover:underline"
                        >
                          {r.name}
                        </Link>
                      )}
                      {r.is_system && (
                        <span
                          title="これはシステム標準カテゴリです（削除不可）"
                          className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"
                        >
                          標準
                        </span>
                      )}
                      {deleted && (
                        <span className="ml-2 rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300">
                          非表示
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right align-top text-zinc-600 dark:text-zinc-400">
                      {r.display_order}
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
                        <div className="flex justify-end gap-1">
                          <Link
                            href={`/dashboard/work-item-categories/${r.id}/edit`}
                            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                          >
                            編集
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDelete(r)}
                            disabled={busy || r.is_system}
                            title={
                              r.is_system
                                ? "標準カテゴリは削除できません"
                                : undefined
                            }
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
    </>
  );
}
