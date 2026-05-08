"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatYen } from "@/lib/format";
import type { WorkMenuItem, WorkMenuSet } from "@/lib/types";
import {
  deleteWorkMenuSet,
  duplicateWorkMenuSet,
  restoreWorkMenuSet,
} from "./actions";

type SetWithItems = WorkMenuSet & {
  items: { menu: WorkMenuItem; position: number }[];
};

function menuTotal(m: WorkMenuItem): number {
  return m.default_labor_cost > 0 || m.default_parts_cost > 0
    ? m.default_labor_cost + m.default_parts_cost
    : m.default_unit_price;
}

type Props = {
  rows: SetWithItems[];
  includeDeleted?: boolean;
};

export default function WorkMenuSetsList({ rows, includeDeleted }: Props) {
  const router = useRouter();
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDelete(s: WorkMenuSet) {
    if (
      !confirm(
        `作業セット「${s.name}」を非表示にします。よろしいですか？\n（後から「非表示を含める」で復元できます）`,
      )
    ) {
      return;
    }
    setBusy(true);
    const r = await deleteWorkMenuSet(s.id);
    setBusy(false);
    if ("error" in r) alert(r.error);
    else router.refresh();
  }

  async function handleRestore(id: string) {
    setBusy(true);
    const r = await restoreWorkMenuSet(id);
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
      {/* 非表示を含めるトグル */}
      <div className="mb-3 flex items-center justify-end">
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

      {rows.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white px-6 py-12 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          作業セットが登録されていません。
        </div>
      ) : (
    <ul className="space-y-3">
      {rows.map((s) => {
        const total = s.items.reduce((sum, x) => sum + menuTotal(x.menu), 0);
        const open = openIds.has(s.id);
        const deleted = s.deleted_at !== null;
        return (
          <li
            key={s.id}
            className={`overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 ${
              deleted ? "opacity-50" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-4 px-5 py-4">
              <button
                type="button"
                onClick={() => toggle(s.id)}
                aria-expanded={open}
                className="flex-1 text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                    {s.name}
                  </span>
                  {deleted && (
                    <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300">
                      非表示
                    </span>
                  )}
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {s.items.length} 件 / 合計 {formatYen(total)}
                  </span>
                  <span
                    aria-hidden
                    className={`text-xs text-zinc-400 transition-transform ${
                      open ? "rotate-180" : ""
                    }`}
                  >
                    ▾
                  </span>
                </div>
                {s.memo && (
                  <p className="mt-1 whitespace-pre-wrap text-xs text-zinc-500 dark:text-zinc-400">
                    {s.memo}
                  </p>
                )}
              </button>
              <div className="flex shrink-0 gap-1">
                {deleted ? (
                  <button
                    type="button"
                    onClick={() => handleRestore(s.id)}
                    disabled={busy}
                    className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    復元
                  </button>
                ) : (
                  <>
                    <Link
                      href={`/dashboard/work-menu-sets/${s.id}/edit`}
                      className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      編集
                    </Link>
                    <form action={duplicateWorkMenuSet}>
                      <input type="hidden" name="id" value={s.id} />
                      <button
                        type="submit"
                        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        複製
                      </button>
                    </form>
                    <button
                      type="button"
                      onClick={() => handleDelete(s)}
                      disabled={busy}
                      className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950"
                    >
                      削除
                    </button>
                  </>
                )}
              </div>
            </div>

            <div
              className={`grid overflow-hidden border-t border-zinc-200 transition-[grid-template-rows] duration-200 dark:border-zinc-800 ${
                open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="overflow-hidden">
                {s.items.length === 0 ? (
                  <p className="px-5 py-3 text-xs text-zinc-500 dark:text-zinc-400">
                    （メニュー未登録）
                  </p>
                ) : (
                  <ol className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {s.items.map((x) => (
                      <li
                        key={`${s.id}-${x.position}-${x.menu.id}`}
                        className="flex items-center justify-between gap-3 px-5 py-2 text-sm"
                      >
                        <div className="min-w-0 flex-1 truncate">
                          <span className="text-zinc-900 dark:text-zinc-50">
                            {x.menu.work_name}
                          </span>
                          {x.menu.part_name && (
                            <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
                              {x.menu.part_name}
                            </span>
                          )}
                        </div>
                        <span className="text-zinc-700 dark:text-zinc-300">
                          {formatYen(menuTotal(x.menu))}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
      )}
    </>
  );
}
