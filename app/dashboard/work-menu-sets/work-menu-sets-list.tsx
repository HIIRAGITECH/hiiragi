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

// 部品の参考表示（金額は固定保存しない。refUnitPrice は汎用価格でサーバー側で算出済み）。
type SetPart = {
  partId: string;
  name: string;
  quantity: number;
  position: number;
  refUnitPrice: number | null; // 汎用(定価)ベースの参考単価。不明なら null。
};

type SetWithItems = WorkMenuSet & {
  items: { menu: WorkMenuItem; position: number }[];
  parts: SetPart[];
};

function menuTotal(m: WorkMenuItem): number {
  return m.default_labor_cost > 0 || m.default_parts_cost > 0
    ? m.default_labor_cost + m.default_parts_cost
    : m.default_unit_price;
}

// 部品の参考金額合計（refUnitPrice が不明な行は 0 として集計から除外）。
function partsRefTotal(parts: SetPart[]): number {
  return parts.reduce(
    (sum, p) => sum + (p.refUnitPrice ?? 0) * p.quantity,
    0,
  );
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
      <div className="mb-3 flex items-center justify-end">
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-[var(--color-ink-mid)]">
          <input
            type="checkbox"
            checked={!!includeDeleted}
            onChange={(e) => toggleIncludeDeleted(e.target.checked)}
          />
          非表示を含める
        </label>
      </div>

      {rows.length === 0 ? (
        <div className="wos-card text-center py-12 text-sm text-[var(--color-ink-light)]">
          作業セットが登録されていません。
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((s) => {
            const total = s.items.reduce(
              (sum, x) => sum + menuTotal(x.menu),
              0,
            );
            const partRef = partsRefTotal(s.parts);
            const hasParts = s.parts.length > 0;
            const open = openIds.has(s.id);
            const deleted = s.deleted_at !== null;
            return (
              <li
                key={s.id}
                className={`border border-[var(--color-line)] bg-[var(--color-paper)] ${
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
                      <span className="text-base font-semibold text-[var(--color-ink)]">
                        {s.name}
                      </span>
                      {deleted && (
                        <span className="text-[10px] px-1.5 py-0.5 border border-[var(--color-line)] text-[var(--color-ink-light)]">
                          非表示
                        </span>
                      )}
                      <span className="text-xs text-[var(--color-ink-light)]">
                        メニュー {s.items.length}件 {formatYen(total)}
                        {hasParts && (
                          <>
                            {" ／ "}
                            部品(参考) {s.parts.length}件 {formatYen(partRef)}
                          </>
                        )}
                      </span>
                      <span
                        aria-hidden
                        className={`text-xs text-[var(--color-ink-light)] transition-transform ${
                          open ? "rotate-180" : ""
                        }`}
                      >
                        ▾
                      </span>
                    </div>
                    {s.memo && (
                      <p className="mt-1 whitespace-pre-wrap text-xs text-[var(--color-ink-light)]">
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
                        className="wos-btn-ghost wos-btn-xs"
                      >
                        復元
                      </button>
                    ) : (
                      <>
                        <Link
                          href={`/dashboard/work-menu-sets/${s.id}/edit`}
                          className="wos-btn-ghost wos-btn-xs"
                        >
                          編集
                        </Link>
                        <form action={duplicateWorkMenuSet}>
                          <input type="hidden" name="id" value={s.id} />
                          <button type="submit" className="wos-btn-ghost wos-btn-xs">
                            複製
                          </button>
                        </form>
                        <button
                          type="button"
                          onClick={() => handleDelete(s)}
                          disabled={busy}
                          className="wos-btn-danger wos-btn-xs"
                        >
                          削除
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div
                  className={`grid overflow-hidden border-t border-[var(--color-line)] transition-[grid-template-rows] duration-200 ${
                    open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="overflow-hidden">
                    {s.items.length === 0 && !hasParts ? (
                      <p className="px-5 py-3 text-xs text-[var(--color-ink-light)]">
                        （中身なし）
                      </p>
                    ) : (
                      <>
                        {s.items.length > 0 && (
                          <ol className="divide-y divide-[var(--color-line)]">
                            {s.items.map((x) => (
                              <li
                                key={`${s.id}-${x.position}-${x.menu.id}`}
                                className="flex items-center justify-between gap-3 px-5 py-2 text-sm"
                              >
                                <div className="min-w-0 flex-1 truncate">
                                  <span className="text-[var(--color-ink)]">
                                    {x.menu.work_name}
                                  </span>
                                  {x.menu.part_name && (
                                    <span className="ml-2 text-xs text-[var(--color-ink-light)]">
                                      {x.menu.part_name}
                                    </span>
                                  )}
                                </div>
                                <span className="wos-num text-[var(--color-ink-soft)]">
                                  {formatYen(menuTotal(x.menu))}
                                </span>
                              </li>
                            ))}
                          </ol>
                        )}

                        {hasParts && (
                          <div className="border-t border-[var(--color-line)] bg-[var(--color-cream)]/40">
                            <div className="flex items-center gap-2 px-5 pt-2.5 pb-1">
                              <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-ink-light)]">
                                部品
                              </span>
                              <span className="rounded-full border border-[var(--color-line)] px-1.5 py-px text-[10px] text-[var(--color-ink-light)]">
                                参考価格
                              </span>
                            </div>
                            <ol className="divide-y divide-[var(--color-line)]">
                              {s.parts.map((p) => (
                                <li
                                  key={`${s.id}-part-${p.position}-${p.partId}`}
                                  className="flex items-center justify-between gap-3 px-5 py-2 text-sm"
                                >
                                  <div className="min-w-0 flex-1 truncate">
                                    <span className="text-[var(--color-ink)]">
                                      {p.name}
                                    </span>
                                    <span className="ml-2 text-xs text-[var(--color-ink-light)]">
                                      × {p.quantity}
                                    </span>
                                  </div>
                                  <span className="wos-num text-[var(--color-ink-soft)]">
                                    {p.refUnitPrice != null
                                      ? formatYen(p.refUnitPrice * p.quantity)
                                      : "—"}
                                  </span>
                                </li>
                              ))}
                            </ol>
                            <p className="px-5 pb-2.5 pt-1.5 text-[11px] text-[var(--color-ink-light)]">
                              ※ 部品は汎用価格（車種指定なし）の目安です。受注では車両に合わせた車種別価格で計算されます。
                            </p>
                          </div>
                        )}
                      </>
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
