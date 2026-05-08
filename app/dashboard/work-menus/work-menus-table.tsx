"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import SearchInput from "@/lib/components/search-input";
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

// フィルタ値: 'all' または item_category_id（uuid）。
type Filter = "all" | string;

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFKC");
}

type Props = {
  rows: WorkMenuItem[];
  // 非表示（deleted_at が立った）行も含めて受け取っているか。
  // 親ページが ?include_deleted=1 のときだけ true を渡す。
  includeDeleted?: boolean;
  // フィルタ・バッジ表示で使う、アクティブな業務カテゴリ一覧。
  allCategories: WorkItemCategory[];
};

// 削除ダイアログの状態。
// loading: 使用回数取得中。confirming: 警告ダイアログ表示中（mode 選択あり）。
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

  // 行の item_category_id → カテゴリ名の解決マップ。
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

  // 削除ボタン押下: 使用回数を取得し、0 件なら即時確認、>0 なら警告ダイアログを開く。
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
      // ケースA: どこからも参照されていない → 即時物理削除（簡易確認のみ）
      setDialog(null);
      if (
        !confirm(`「${row.work_name}」を削除します。よろしいですか？`)
      ) {
        return;
      }
      setBusy(true);
      const r = await deleteWorkMenu(row.id, "hard");
      setBusy(false);
      if ("error" in r) alert(r.error);
      else router.refresh();
      return;
    }
    // ケースB: 参照あり → 警告ダイアログ（既定は推奨の "soft"）
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

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {[
          { value: "all" as Filter, label: "すべて" },
          ...allCategories.map((c) => ({ value: c.id as Filter, label: c.name })),
        ].map((f) => (
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
        {/* 非表示を含めるトグル: URL の ?include_deleted=1 を付け外しすると親 Server Component が再フェッチする */}
        <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={!!includeDeleted}
            onChange={(e) => {
              const url = new URL(window.location.href);
              if (e.target.checked) url.searchParams.set("include_deleted", "1");
              else url.searchParams.delete("include_deleted");
              router.push(url.pathname + url.search);
            }}
            className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-900"
          />
          非表示を含める
        </label>
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
                            pending ||
                            idx === 0 ||
                            isFiltering ||
                            deleted
                          }
                          aria-label="上に移動"
                          title={
                            deleted
                              ? "非表示のメニューは並び替えできません"
                              : isFiltering
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
                            pending ||
                            idx === filtered.length - 1 ||
                            isFiltering ||
                            deleted
                          }
                          aria-label="下に移動"
                          title={
                            deleted
                              ? "非表示のメニューは並び替えできません"
                              : isFiltering
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
                      {deleted ? (
                        <span>{r.work_name}</span>
                      ) : (
                        <Link
                          href={`/dashboard/work-menus/${r.id}/edit`}
                          className="hover:underline"
                        >
                          {r.work_name}
                        </Link>
                      )}
                      {deleted && (
                        <span className="ml-2 rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300">
                          非表示
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 align-top text-zinc-600 dark:text-zinc-400">
                      {r.part_name ?? "—"}
                    </td>
                    <td className="px-3 py-3 align-top text-zinc-600 dark:text-zinc-400">
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                        {(r.item_category_id &&
                          categoryNameMap.get(r.item_category_id)) ||
                          "（未分類）"}
                      </span>
                      {r.tax_category === "shaken_non_tax" && (
                        <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
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
                          <button
                            type="button"
                            onClick={() => handleDeleteClick(r)}
                            disabled={busy}
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

      {/* 削除ダイアログ: usage を取得中の loading 表示と、参照あり時の警告 */}
      {dialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !busy && setDialog(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            {dialog.kind === "loading" ? (
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                使用回数を確認しています…
              </p>
            ) : (
              <>
                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                  「{dialog.row.work_name}」を削除しますか？
                </h3>
                <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                  このメニューは現在、以下で使用されています:
                </p>
                <ul className="mt-1.5 list-disc pl-5 text-sm text-zinc-700 dark:text-zinc-300">
                  <li>
                    過去の受注明細: {dialog.usage.orderItemCount} 件
                  </li>
                  <li>
                    作業セット: {dialog.usage.setCount} 件
                    {dialog.usage.sets.length > 0 && (
                      <span className="text-zinc-500 dark:text-zinc-400">
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
                    className={`flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm transition-colors ${
                      dialog.mode === "soft"
                        ? "border-zinc-900 bg-zinc-50 dark:border-zinc-50 dark:bg-zinc-800/40"
                        : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                    }`}
                  >
                    <input
                      type="radio"
                      name="delete-mode"
                      value="soft"
                      checked={dialog.mode === "soft"}
                      onChange={() =>
                        setDialog({ ...dialog, mode: "soft" })
                      }
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-medium text-zinc-900 dark:text-zinc-50">
                        非表示にする（推奨）
                      </span>
                      <span className="mt-0.5 block text-xs text-zinc-600 dark:text-zinc-400">
                        一覧から非表示にしますが、過去の記録は残ります。後から復元できます。
                      </span>
                    </span>
                  </label>
                  <label
                    className={`flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm transition-colors ${
                      dialog.mode === "hard"
                        ? "border-red-500 bg-red-50 dark:border-red-700 dark:bg-red-950/40"
                        : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                    }`}
                  >
                    <input
                      type="radio"
                      name="delete-mode"
                      value="hard"
                      checked={dialog.mode === "hard"}
                      onChange={() =>
                        setDialog({ ...dialog, mode: "hard" })
                      }
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-medium text-red-700 dark:text-red-400">
                        完全に削除する
                      </span>
                      <span className="mt-0.5 block text-xs text-zinc-600 dark:text-zinc-400">
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
                    className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDelete}
                    disabled={busy}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                      dialog.mode === "hard"
                        ? "bg-red-600 hover:bg-red-700"
                        : "bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                    }`}
                  >
                    {busy ? "実行中..." : "実行する"}
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
