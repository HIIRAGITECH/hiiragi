"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { saveOrderAsSet } from "../actions";

type Props = {
  orderId: string;
  defaultName?: string;
  itemsCount: number;
};

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-50 dark:focus:ring-zinc-50";

const labelClass =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";

export default function SaveAsSetButton({
  orderId,
  defaultName,
  itemsCount,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [name, setName] = useState(defaultName ?? "");
  const [memo, setMemo] = useState("");
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    firstFieldRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) closeModal();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pending]);

  function openModal() {
    setError(null);
    setSuccess(null);
    setName(defaultName ?? "");
    setMemo("");
    setOpen(true);
  }

  function closeModal() {
    if (pending) return;
    setOpen(false);
  }

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("セット名は必須です。");
      return;
    }
    setPending(true);
    setError(null);
    setSuccess(null);
    const result = await saveOrderAsSet(
      orderId,
      trimmed,
      memo.trim() === "" ? null : memo.trim(),
    );
    setPending(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    const created = result.newMenuCount;
    const reused = result.reusedMenuCount;
    const parts = result.partCount;
    const menuDetail =
      created > 0 && reused > 0
        ? `既存メニュー ${reused} 件を再利用、新規メニュー ${created} 件を作成`
        : created > 0
          ? `新規メニュー ${created} 件を作成`
          : reused > 0
            ? `既存メニュー ${reused} 件を再利用`
            : "";
    const partDetail = parts > 0 ? `部品 ${parts} 件を登録` : "";
    const detailParts = [menuDetail, partDetail].filter(Boolean);
    const detail = detailParts.length > 0 ? `（${detailParts.join("、")}）` : "";
    setSuccess(`作業セット「${trimmed}」を作成しました。${detail}`);
    // 「セットから追加」で見えるようキャッシュを更新する。
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="wos-btn-ghost wos-btn-sm"
        title="この受注の明細を作業セットとして保存します"
      >
        📦 作業セットとして保存
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="save-as-set-title"
            onClick={closeModal}
          >
            <div
              className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4">
                <h3
                  id="save-as-set-title"
                  className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
                >
                  作業セットとして保存
                </h3>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  この受注の明細 {itemsCount} 件を作業セットとして登録します。
                  以後、別の受注の明細編集で「📦 セットから追加」から呼び出せます。
                  手入力の明細は同時に作業メニューマスターにも追加されます。
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label htmlFor="sas_name" className={labelClass}>
                    セット名<span className="ml-0.5 text-red-500">*</span>
                  </label>
                  <input
                    ref={firstFieldRef}
                    id="sas_name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="アルト車検一式"
                    className={inputClass}
                    disabled={pending || success !== null}
                    maxLength={100}
                  />
                </div>
                <div>
                  <label htmlFor="sas_memo" className={labelClass}>
                    メモ（任意）
                  </label>
                  <textarea
                    id="sas_memo"
                    rows={3}
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    placeholder="軽自動車の車検フルメニュー"
                    className={inputClass}
                    disabled={pending || success !== null}
                  />
                </div>
              </div>

              {error && (
                <p
                  role="alert"
                  className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
                >
                  {error}
                </p>
              )}
              {success && (
                <p
                  role="status"
                  className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                >
                  {success}
                </p>
              )}

              <div className="mt-6 flex items-center justify-end gap-2">
                {success ? (
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    閉じる
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={closeModal}
                      disabled={pending}
                      className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      キャンセル
                    </button>
                    <button
                      type="button"
                      onClick={submit}
                      disabled={pending || name.trim() === ""}
                      className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                    >
                      {pending ? "保存中..." : "保存する"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
