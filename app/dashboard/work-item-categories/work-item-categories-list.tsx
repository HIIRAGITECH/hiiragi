"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
      <div className="border-b border-[var(--color-line)] bg-[var(--color-paper)] px-8 py-4 flex flex-wrap items-center gap-4">
        <div className="wos-search max-w-[480px]">
          <span className="wos-ico">⌕</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="カテゴリ名で検索…"
          />
        </div>
        <span className="text-xs text-[var(--color-ink-light)] tracking-widest">
          {isFiltering
            ? `${rows.length} 件中 ${filtered.length} 件`
            : `登録件数 ${rows.length} 件`}
        </span>
        <label className="text-xs text-[var(--color-ink-mid)] flex items-center gap-2 ml-auto cursor-pointer">
          <input
            type="checkbox"
            checked={!!includeDeleted}
            onChange={(e) => toggleIncludeDeleted(e.target.checked)}
          />
          非表示を含める
        </label>
      </div>

      <div className="flex-1 overflow-auto bg-[var(--color-cream)]">
        <div className="px-8 py-6">
          {filtered.length === 0 ? (
            <div className="wos-card text-center py-12 text-sm text-[var(--color-ink-light)]">
              {isFiltering
                ? "該当するカテゴリが見つかりません。"
                : "カテゴリが登録されていません。"}
            </div>
          ) : (
            <table className="w-full border-collapse bg-[var(--color-paper)] border border-[var(--color-line)]">
              <thead>
                <tr className="border-b-2 border-[var(--color-line-strong)] bg-[var(--color-cream)]">
                  <th className="wos-th w-16 text-center">並び</th>
                  <th className="wos-th">カテゴリ名</th>
                  <th className="wos-th right w-24">並び順</th>
                  <th className="wos-th right w-44">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, idx) => {
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
                            href={`/dashboard/work-item-categories/${r.id}/edit`}
                            className="font-semibold text-[var(--color-ink)] hover:underline"
                          >
                            {r.name}
                          </Link>
                        )}
                        {r.is_system && (
                          <span
                            title="これはシステム標準カテゴリです（削除不可）"
                            className="ml-2 text-[10px] text-[var(--color-accent)] font-medium"
                          >
                            ◆ 標準
                          </span>
                        )}
                        {deleted && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 border border-[var(--color-line)] text-[var(--color-ink-light)]">
                            非表示
                          </span>
                        )}
                      </td>
                      <td className="wos-td num right">{r.display_order}</td>
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
                          <div className="flex justify-end gap-1">
                            <Link
                              href={`/dashboard/work-item-categories/${r.id}/edit`}
                              className="wos-btn-ghost wos-btn-xs"
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
    </>
  );
}
