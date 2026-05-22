"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/format";
import {
  deductStock,
  getStockDeductionPreview,
  reverseStockDeduction,
  type StockDeductionPreviewRow,
} from "../actions";

type Props = {
  orderId: string;
  stockDeducted: boolean;
  stockDeductedAt: string | null;
};

// 「📦 在庫を引く」セクション。受注詳細ページから利用する。
// 引き前プレビューを取得 → 確認モーダル → 確定で RPC 経由で減算。
// 引き済みの受注は取り消しボタンが出る。
export default function StockDeductionSection({
  orderId,
  stockDeducted,
  stockDeductedAt,
}: Props) {
  const router = useRouter();
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<
    | null
    | {
        direct: StockDeductionPreviewRow[];
        indirect: StockDeductionPreviewRow[];
      }
  >(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPreview() {
    setError(null);
    setPreviewLoading(true);
    const res = await getStockDeductionPreview(orderId);
    setPreviewLoading(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setPreview({ direct: res.direct, indirect: res.indirect });
  }

  async function handleConfirmDeduct() {
    setBusy(true);
    setError(null);
    const res = await deductStock(orderId);
    setBusy(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setPreview(null);
    router.refresh();
  }

  async function handleReverse() {
    if (
      !confirm(
        "在庫引きを取り消します。引いた分の在庫が戻ります。よろしいですか？",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    const res = await reverseStockDeduction(orderId);
    setBusy(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <section className="mt-8 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="mb-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">
        在庫引き
      </h3>
      <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
        部品マスターにリンクされた明細について、確定したタイミングで在庫を引きます。
      </p>

      {stockDeducted ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm dark:border-emerald-900/60 dark:bg-emerald-950/30">
            <span className="font-medium text-emerald-800 dark:text-emerald-300">
              ✅ 在庫引き済み
            </span>
            {stockDeductedAt && (
              <span className="text-xs text-emerald-700 dark:text-emerald-400">
                （{formatDeductedAt(stockDeductedAt)}）
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleReverse}
            disabled={busy}
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            ↩ 在庫引きを取り消す
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={openPreview}
          disabled={previewLoading || busy}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {previewLoading ? "確認中..." : "📦 在庫を引く"}
        </button>
      )}

      {error && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {preview && (
        <DeductionConfirmModal
          direct={preview.direct}
          indirect={preview.indirect}
          busy={busy}
          onCancel={() => setPreview(null)}
          onConfirm={handleConfirmDeduct}
        />
      )}
    </section>
  );
}

function DeductionConfirmModal({
  direct,
  indirect,
  busy,
  onCancel,
  onConfirm,
}: {
  direct: StockDeductionPreviewRow[];
  indirect: StockDeductionPreviewRow[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const hasShortage =
    direct.some((r) => r.next_stock < 0) ||
    indirect.some((r) => r.next_stock < 0);
  const empty = direct.length === 0 && indirect.length === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={busy ? undefined : onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          在庫を引きますか？
        </h3>

        {empty ? (
          <p className="mt-3 rounded-md bg-zinc-50 px-3 py-2 text-sm text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">
            この受注には在庫管理対象の部品がありません。
            <br />
            （明細が部品マスターにリンクされていません）
          </p>
        ) : (
          <div className="mt-3 max-h-[55vh] space-y-3 overflow-y-auto">
            {direct.length > 0 && (
              <PreviewSection title="【明細の部品】" rows={direct} />
            )}
            {indirect.length > 0 && (
              <PreviewSection
                title="【間接材料】"
                rows={indirect}
                hint="明細・PDFには表示されません。在庫だけ減らします。"
              />
            )}
            {hasShortage && (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                ⚠️ 一部の部品で在庫が不足します。マイナス在庫として記録され、後で棚卸調整できます。
              </p>
            )}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {busy ? "実行中..." : empty ? "フラグだけ立てる" : "在庫を引く"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewSection({
  title,
  rows,
  hint,
}: {
  title: string;
  rows: StockDeductionPreviewRow[];
  hint?: string;
}) {
  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
        {title}
      </h4>
      {hint && (
        <p className="mb-1 text-[10px] text-zinc-500 dark:text-zinc-400">
          {hint}
        </p>
      )}
      <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {rows.map((r) => {
          const shortage = r.next_stock < 0;
          return (
            <li
              key={r.part_id}
              className={`px-3 py-2 text-sm ${
                shortage ? "bg-amber-50 dark:bg-amber-950/20" : ""
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-zinc-900 dark:text-zinc-50">
                  {r.part_name}
                  {r.deleted && (
                    <span className="ml-2 rounded bg-zinc-200 px-1 py-0.5 text-[10px] text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300">
                      非表示
                    </span>
                  )}
                </span>
                <span className="font-mono text-zinc-700 dark:text-zinc-300">
                  −{r.quantity}
                  {r.unit ? r.unit : ""}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                在庫 {r.current_stock} → {r.next_stock}
                {shortage && (
                  <span className="ml-2 font-medium text-amber-700 dark:text-amber-300">
                    ⚠️ 在庫不足
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// stock_deducted_at（ISO 文字列）を YYYY/MM/DD HH:mm の形式で表示する。
// JST 想定で toLocaleString を呼ぶとサーバー/クライアントのロケール差で SSR mismatch が
// 起きうるため、UTC 値から手動で組み立てる方式は採らない。クライアント側でだけ整形する。
function formatDeductedAt(iso: string): string {
  try {
    const d = new Date(iso);
    const ymd = formatDate(d.toISOString().slice(0, 10));
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${ymd} ${hh}:${mm}`;
  } catch {
    return iso;
  }
}
