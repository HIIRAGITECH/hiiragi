"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatYen } from "@/lib/format";
import type { WorkItemCategory, WorkMenuItem } from "@/lib/types";
import type { WorkMenuUsage } from "@/lib/work-menus/usage";
import {
  deleteWorkMenu,
  duplicateWorkMenu,
  getWorkMenuUsageAction,
  moveWorkMenu,
  restoreWorkMenu,
} from "./actions";

type Filter = "all" | string;

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFKC");
}

type Props = {
  rows: WorkMenuItem[];
  includeDeleted?: boolean;
  allCategories: WorkItemCategory[];
};

type DeleteDialog =
  | { kind: "loading"; row: WorkMenuItem }
  | {
      kind: "confirming";
      row: WorkMenuItem;
      usage: WorkMenuUsage;
      mode: "soft" | "hard";
    };

export default function WorkMenusTable({
  rows,
  includeDeleted,
  allCategories,
}: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<DeleteDialog | null>(null);
  const [busy, setBusy] = useState(false);

  const categoryNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of allCategories) m.set(c.id, c.name);
    return m;
  }, [allCategories]);

  const filtered = useMemo(() => {
    let list = rows;
    if (filter !== "all") {
      list = list.filter((r) => r.item_category_id === filter);
    }
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

  async function handleDeleteClick(row: WorkMenuItem) {
    setDialog({ kind: "loading", row });
    const res = await getWorkMenuUsageAction(row.id);
    if ("error" in res) {
      alert(res.error);
      setDialog(null);
      return;
    }
    const usage = res.usage;
    if (usage.orderItemCount === 0 && usage.setCount === 0) {
      setDialog(null);
      if (!confirm(`「${row.work_name}」を削除します。よろしいですか？`)) {
        return;
      }
      setBusy(true);
      const r = await deleteWorkMenu(row.id, "hard");
      setBusy(false);
      if ("error" in r) alert(r.error);
      else router.refresh();
      return;
    }
    setDialog({ kind: "confirming", row, usage, mode: "soft" });
  }

  async function handleConfirmDelete() {
    if (dialog?.kind !== "confirming") return;
    const { row, mode } = dialog;
    setBusy(true);
    const r = await deleteWorkMenu(row.id, mode);
    setBusy(false);
    if ("error" in r) {
      alert(r.error);
      return;
    }
    setDialog(null);
    router.refresh();
  }

  async function handleRestore(id: string) {
    setBusy(true);
    const r = await restoreWorkMenu(id);
    setBusy(false);
    if ("error" in r) alert(r.error);
    else router.refresh();
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
            placeholder="作業内容・部品名で検索…"
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

      <div className="border-b border-[var(--color-line)] bg-[var(--color-paper)] px-8 py-3 flex flex-wrap items-center gap-2">
        {[
          { value: "all" as Filter, label: "すべて" },
          ...allCategories.map((c) => ({
            value: c.id as Filter,
            label: c.name,
          })),
        ].map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`wos-chip ${filter === f.value ? "active" : ""}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto bg-[var(--color-cream)]">
        <div className="px-8 py-6">
          {filtered.length === 0 ? (
            <div className="wos-card text-center py-12 text-sm text-[var(--color-ink-light)]">
              {isFiltering
                ? "該当する作業メニューが見つかりません。"
                : "作業メニューが登録されていません。"}
            </div>
          ) : (
            <table className="w-full border-collapse bg-[var(--color-paper)] border border-[var(--color-line)]">
              <thead>
                <tr className="border-b-2 border-[var(--color-line-strong)] bg-[var(--color-cream)]">
                  <th className="wos-th w-16 text-center">並び</th>
                  <th className="wos-th">作業内容</th>
                  <th className="wos-th">部品名</th>
                  <th className="wos-th">カテゴリ</th>
                  <th className="wos-th right">工賃</th>
                  <th className="wos-th right">部品代</th>
                  <th className="wos-th right">合計</th>
                  <th className="wos-th right w-44">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, idx) => {
                  const total =
                    r.default_labor_cost > 0 || r.default_parts_cost > 0
                      ? r.default_labor_cost + r.default_parts_cost
                      : r.default_unit_price;
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
                          <span className="font-semibold">{r.work_name}</span>
                        ) : (
                          <Link
                            href={`/dashboard/work-menus/${r.id}/edit`}
                            className="font-semibold text-[var(--color-ink)] hover:underline"
                          >
                            {r.work_name}
                          </Link>
                        )}
                        {deleted && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 border border-[var(--color-line)] text-[var(--color-ink-light)]">
                            非表示
                          </span>
                        )}
                      </td>
                      <td className="wos-td muted">
                        <span>{r.part_name ?? "—"}</span>
                        {r.linked_part_id && (
                          <span
                            className="ml-1.5 text-[10px] font-medium text-[var(--color-accent)]"
                            title="部品マスターにリンクされています（在庫管理対象）"
                          >
                            ◆ 在庫
                          </span>
                        )}
                      </td>
                      <td className="wos-td muted">
                        <span className="text-[11px] text-[var(--color-ink-soft)]">
                          {(r.item_category_id &&
                            categoryNameMap.get(r.item_category_id)) ||
                            "（未分類）"}
                        </span>
                        {r.tax_category === "shaken_non_tax" && (
                          <span className="ml-1 text-[10px] text-[var(--color-warn)]">
                            非課税
                          </span>
                        )}
                      </td>
                      <td className="wos-td num right">
                        {r.default_labor_cost > 0
                          ? formatYen(r.default_labor_cost)
                          : "—"}
                      </td>
                      <td className="wos-td num right">
                        {r.default_parts_cost > 0
                          ? formatYen(r.default_parts_cost)
                          : "—"}
                      </td>
                      <td className="wos-td num right font-semibold">
                        {formatYen(total)}
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
                          <div className="flex justify-end gap-1">
                            <Link
                              href={`/dashboard/work-menus/${r.id}/edit`}
                              className="wos-btn-ghost wos-btn-xs"
                            >
                              編集
                            </Link>
                            <form action={duplicateWorkMenu}>
                              <input type="hidden" name="id" value={r.id} />
                              <button type="submit" className="wos-btn-ghost wos-btn-xs">
                                複製
                              </button>
                            </form>
                            <button
                              type="button"
                              onClick={() => handleDeleteClick(r)}
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

      {dialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !busy && setDialog(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-lg bg-[var(--color-paper)] p-5 border border-[var(--color-line-strong)]"
            onClick={(e) => e.stopPropagation()}
          >
            {dialog.kind === "loading" ? (
              <p className="text-sm text-[var(--color-ink-soft)]">
                使用回数を確認しています…
              </p>
            ) : (
              <>
                <h3 className="text-base font-semibold text-[var(--color-ink)]">
                  「{dialog.row.work_name}」を削除しますか？
                </h3>
                <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
                  このメニューは現在、以下で使用されています:
                </p>
                <ul className="mt-1.5 list-disc pl-5 text-sm text-[var(--color-ink-soft)]">
                  <li>過去の受注明細: {dialog.usage.orderItemCount} 件</li>
                  <li>
                    作業セット: {dialog.usage.setCount} 件
                    {dialog.usage.sets.length > 0 && (
                      <span className="text-[var(--color-ink-light)]">
                        {" "}
                        （
                        {dialog.usage.sets
                          .map((s) => `「${s.name}」`)
                          .join(" ")}
                        ）
                      </span>
                    )}
                  </li>
                </ul>

                <div className="mt-4 space-y-2">
                  <label
                    className={`flex cursor-pointer items-start gap-2 border p-3 text-sm transition-colors ${
                      dialog.mode === "soft"
                        ? "border-[var(--color-ink)] bg-[var(--color-cream)]"
                        : "border-[var(--color-line)] bg-[var(--color-paper)]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="delete-mode"
                      value="soft"
                      checked={dialog.mode === "soft"}
                      onChange={() => setDialog({ ...dialog, mode: "soft" })}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-semibold text-[var(--color-ink)]">
                        非表示にする（推奨）
                      </span>
                      <span className="mt-0.5 block text-xs text-[var(--color-ink-mid)]">
                        一覧から非表示にしますが、過去の記録は残ります。後から復元できます。
                      </span>
                    </span>
                  </label>
                  <label
                    className={`flex cursor-pointer items-start gap-2 border p-3 text-sm transition-colors ${
                      dialog.mode === "hard"
                        ? "border-[var(--color-warn)] bg-[rgba(184,80,64,0.06)]"
                        : "border-[var(--color-line)] bg-[var(--color-paper)]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="delete-mode"
                      value="hard"
                      checked={dialog.mode === "hard"}
                      onChange={() => setDialog({ ...dialog, mode: "hard" })}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-semibold text-[var(--color-warn)]">
                        完全に削除する
                      </span>
                      <span className="mt-0.5 block text-xs text-[var(--color-ink-mid)]">
                        過去の明細との紐付けが切れ、使用回数の集計ができなくなります。セットからも自動的に外されます。
                      </span>
                    </span>
                  </label>
                </div>

                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDialog(null)}
                    disabled={busy}
                    className="wos-btn-ghost wos-btn-sm"
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDelete}
                    disabled={busy}
                    className={
                      dialog.mode === "hard"
                        ? "wos-btn-danger wos-btn-sm"
                        : "wos-btn wos-btn-sm"
                    }
                  >
                    {busy ? "実行中…" : "実行する"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
