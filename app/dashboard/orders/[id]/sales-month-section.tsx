"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { updateSalesMonth } from "../actions";

type Props = {
  orderId: string;
  // 請求書発行日（ISO timestamptz）。表示は JST の年月。
  invoicedAt: string | null;
  // 経営者判断の売上計上月（YYYY-MM-01）。null なら invoiced_at の月で集計。
  salesMonth: string | null;
};

// ISO timestamptz を JST の {year, month} に変換する。
// 売上集計のクエリ境界（+09:00）と月の判定を一致させるため JST で読む。
function jstYearMonth(iso: string): { y: number; m: number } {
  const d = new Date(iso);
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return { y: jst.getUTCFullYear(), m: jst.getUTCMonth() + 1 };
}

// sales_month（YYYY-MM-01）を {year, month} に。TZ ずれを避けるため文字列から直接読む。
function parseSalesMonth(s: string): { y: number; m: number } | null {
  const m = /^(\d{4})-(\d{2})/.exec(s);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]) };
}

function labelJp(ym: { y: number; m: number }): string {
  return `${ym.y}年${ym.m}月`;
}

function toMonthInput(ym: { y: number; m: number }): string {
  return `${ym.y.toString().padStart(4, "0")}-${ym.m
    .toString()
    .padStart(2, "0")}`;
}

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-50 dark:focus:ring-zinc-50";

export default function SalesMonthSection({
  orderId,
  invoicedAt,
  salesMonth,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 発行日（読み取り専用）と、既定の計上月（sales_month ?? invoiced_at の月）。
  const invoicedYm = invoicedAt ? jstYearMonth(invoicedAt) : null;
  const overrideYm = salesMonth ? parseSalesMonth(salesMonth) : null;
  const effectiveYm = overrideYm ?? invoicedYm;

  // 「変更あり」= 上書きが設定され、かつ発行日の月と異なるとき。
  const changed =
    overrideYm != null &&
    invoicedYm != null &&
    (overrideYm.y !== invoicedYm.y || overrideYm.m !== invoicedYm.m);

  // 入力欄の初期値は現在の実効月。
  const [monthValue, setMonthValue] = useState(
    effectiveYm ? toMonthInput(effectiveYm) : "",
  );

  useEffect(() => {
    if (!open) return;
    // モーダルを開くたびに現在値へ同期。
    setMonthValue(effectiveYm ? toMonthInput(effectiveYm) : "");
    setError(null);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // effectiveYm は open 時点の値で十分（依存に入れると再同期が過剰になる）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pending]);

  async function save(next: string | null) {
    setPending(true);
    setError(null);
    try {
      const res = await updateSalesMonth(orderId, next);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <dl className="space-y-2 text-sm">
        <div className="flex items-baseline gap-3">
          <dt
            className="w-28 shrink-0 text-xs font-medium text-[var(--color-ink-mid)]"
            style={{ letterSpacing: "0.1em" }}
          >
            請求書発行日
          </dt>
          <dd
            className="text-[var(--color-ink)] flex-1"
            style={{ fontFamily: "var(--font-num)" }}
          >
            {invoicedYm ? labelJp(invoicedYm) : "—"}
          </dd>
        </div>
        <div className="flex items-baseline gap-3">
          <dt
            className="w-28 shrink-0 text-xs font-medium text-[var(--color-ink-mid)]"
            style={{ letterSpacing: "0.1em" }}
          >
            売上計上月
          </dt>
          <dd className="flex-1 flex items-center gap-2">
            <span
              className="text-[var(--color-ink)] font-semibold"
              style={{ fontFamily: "var(--font-num)" }}
            >
              {effectiveYm ? labelJp(effectiveYm) : "—"}
            </span>
            {changed && (
              <span className="text-xs text-[var(--color-ink-light)]">
                （変更あり）
              </span>
            )}
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="売上計上月を変更"
              className="text-[var(--color-ink-mid)] hover:text-[var(--color-ink)]"
              title="売上計上月を変更"
            >
              ✎
            </button>
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-[var(--color-ink-light)]">
        経営者判断の会計上の分類です。請求書・お客様マイページには表示されません。
      </p>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sales-month-modal-title"
            onClick={() => !pending && setOpen(false)}
          >
            <div
              className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4">
                <h3
                  id="sales-month-modal-title"
                  className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
                >
                  売上計上月の変更
                </h3>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  この受注を「何月分の売上」として集計するかを指定します。空にして「クリア」すると
                  請求書発行日の月に戻ります。内部管理用で、請求書・マイページには出ません。
                </p>
              </div>

              <div>
                <label
                  htmlFor="sales_month"
                  className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  売上計上月
                </label>
                <input
                  id="sales_month"
                  type="month"
                  value={monthValue}
                  onChange={(e) => setMonthValue(e.target.value)}
                  disabled={pending}
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {invoicedYm
                    ? `請求書発行日の月は ${labelJp(invoicedYm)} です。`
                    : "請求書発行日が未設定です。"}
                </p>
              </div>

              {error && (
                <p
                  role="alert"
                  className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
                >
                  {error}
                </p>
              )}

              <div className="mt-6 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => save(null)}
                  disabled={pending}
                  className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  クリア（発行日の月に戻す）
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    disabled={pending}
                    className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    onClick={() => save(monthValue === "" ? null : monthValue)}
                    disabled={pending}
                    className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    {pending ? "保存中..." : "保存"}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
