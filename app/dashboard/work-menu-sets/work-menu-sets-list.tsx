"use client";

import Link from "next/link";
import { useState } from "react";
import { formatYen } from "@/lib/format";
import type { WorkMenuItem, WorkMenuSet } from "@/lib/types";
import { deleteWorkMenuSet, duplicateWorkMenuSet } from "./actions";

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
};

export default function WorkMenuSetsList({ rows }: Props) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white px-6 py-12 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        作業セットが登録されていません。
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {rows.map((s) => {
        const total = s.items.reduce((sum, x) => sum + menuTotal(x.menu), 0);
        const open = openIds.has(s.id);
        return (
          <li
            key={s.id}
            className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
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
                <form
                  action={deleteWorkMenuSet}
                  onSubmit={(e) => {
                    if (
                      !confirm(
                        `作業セット「${s.name}」を削除します。よろしいですか？`,
                      )
                    ) {
                      e.preventDefault();
                    }
                  }}
                >
                  <input type="hidden" name="id" value={s.id} />
                  <button
                    type="submit"
                    className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs text-red-600 transition-colors hover:bg-red-50 dark:border-red-900 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950"
                  >
                    削除
                  </button>
                </form>
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
  );
}
