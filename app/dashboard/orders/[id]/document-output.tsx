"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { calculateDefaultDueDate } from "@/lib/components/payment-due-modal";
import { buildPdfFileName, type PdfDocType } from "@/lib/pdf/file-name";
import { markEstimateIssued, updateInvoiceMeta } from "../actions";

// 領収書の但し書きデフォルト。PDF 側（lib/pdf-react/InvoiceDocument）の
// DEFAULT_RECEIPT_NOTE と一致させる（client から react-pdf を import しないため複製）。
const DEFAULT_RECEIPT_NOTE = "整備代として";

// ローカル（端末）時刻での今日の日付 YYYY-MM-DD。領収日の既定値に使う。
function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear().toString().padStart(4, "0");
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type Props = {
  orderId: string;
  customerName: string | null;
  // 請求書のファイル名に使う請求日（無ければ当日）。
  invoicedAt: string | null;
  // 受注に保存済みの振込期限（YYYY-MM-DD）。振込期限入力欄の初期値に使う。
  paymentDueDate: string | null;
  // 受注に保存済みの請求書件名。件名入力欄の初期値に使う。
  invoiceSubject: string | null;
};

// 出力対象の帳票（表示順 = 出力順）。
const DOC_TYPES: { key: PdfDocType; label: string }[] = [
  { key: "estimate", label: "見積書" },
  { key: "delivery", label: "納品書" },
  { key: "invoice", label: "請求書" },
  { key: "receipt", label: "領収書" },
];

export default function DocumentOutput({
  orderId,
  customerName,
  invoicedAt,
  paymentDueDate,
  invoiceSubject,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 既定はすべて未チェック（開いた時点で何も選ばれていない）。
  const [selected, setSelected] = useState<Record<PdfDocType, boolean>>({
    estimate: false,
    delivery: false,
    invoice: false,
    receipt: false,
  });
  const [receiptNote, setReceiptNote] = useState(DEFAULT_RECEIPT_NOTE);
  // 振込期限（請求書用）。初期値は受注の保存値、無ければ翌月末（従来モーダルの既定を踏襲）。
  // 「PDFを出力」時に受注の payment_due_date として保存する。
  const [dueDate, setDueDate] = useState(
    paymentDueDate ?? calculateDefaultDueDate(new Date()),
  );
  // 請求書件名。初期値は受注の保存値。「PDFを出力」時に invoice_subject として保存する。
  const [subject, setSubject] = useState(invoiceSubject ?? "");
  // 領収日（領収書用）。既定は操作日（今日）。
  const [receiptDate, setReceiptDate] = useState(todayLocal());

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !generating) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, generating]);

  const chosen = DOC_TYPES.filter((d) => selected[d.key]).map((d) => d.key);

  function toggle(key: PdfDocType) {
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function openModal() {
    setError(null);
    setOpen(true);
  }

  async function generate() {
    if (chosen.length === 0) return;
    setGenerating(true);
    setError(null);
    try {
      // 請求書を含む場合は、振込期限・件名を受注に保存してから PDF を生成する
      // （ステータスは変えない）。保存後に PDF ルートが最新の受注値を読むため、
      // 一覧・入金管理・ダッシュボード・請求書PDF すべてに反映される。
      if (selected.invoice) {
        const saved = await updateInvoiceMeta(orderId, dueDate, subject);
        if (saved?.error) {
          setError(saved.error);
          return;
        }
      }

      const params = new URLSearchParams();
      params.set("types", chosen.join(","));
      if (selected.invoice) {
        // 入力した振込期限を確実に PDF へ反映（保存値と同じだが冪等な保険）。
        params.set("dueDate", dueDate);
      }
      if (selected.receipt) {
        params.set(
          "receiptNote",
          receiptNote.trim() === "" ? DEFAULT_RECEIPT_NOTE : receiptNote.trim(),
        );
        if (receiptDate) params.set("receiptDate", receiptDate);
      }
      const url = `/api/invoice-pdf/${encodeURIComponent(orderId)}?${params.toString()}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const fileName = buildPdfFileName({
        documentType: chosen.length === 1 ? chosen[0] : "combined",
        date:
          chosen.includes("invoice") && invoicedAt
            ? invoicedAt
            : new Date(),
        customerName,
        orderNumber: orderId,
      });

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);

      // 見積書を含む場合は「未作成」→「発行済」に更新（後退はしない）。
      if (selected.estimate) {
        try {
          await markEstimateIssued(orderId);
        } catch {
          // ステータス更新の失敗は PDF 出力をブロックしない。
        }
      }
      // 受注を更新した場合は表示（ステータスバー・振込期限等）を最新化。
      if (selected.invoice || selected.estimate) {
        router.refresh();
      }
      setOpen(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError("PDF生成に失敗しました: " + message);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      <button type="button" onClick={openModal} className="wos-btn wos-btn-sm">
        帳票を出力
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="doc-output-title"
            onClick={() => !generating && setOpen(false)}
          >
            <div
              className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4">
                <h3
                  id="doc-output-title"
                  className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
                >
                  帳票を出力
                </h3>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  出力する帳票を選んでください。複数選ぶと 1 つの PDF
                  にまとめて出力されます。
                </p>
              </div>

              <div className="space-y-2">
                {DOC_TYPES.map((d) => (
                  <label
                    key={d.key}
                    className="flex cursor-pointer items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    <input
                      type="checkbox"
                      checked={selected[d.key]}
                      onChange={() => toggle(d.key)}
                      disabled={generating}
                      className="h-4 w-4"
                    />
                    {d.label}
                  </label>
                ))}
              </div>

              {/* 請求書を選んだときのみ振込期限・件名を表示。出力時に受注へ保存する。 */}
              {selected.invoice && (
                <div className="mt-4 space-y-4">
                  <div>
                    <label
                      htmlFor="due_date"
                      className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                    >
                      振込期限
                    </label>
                    <input
                      id="due_date"
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      disabled={generating}
                      className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-50 dark:focus:ring-zinc-50"
                    />
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      出力時に受注へ保存し、請求書・一覧・入金管理に反映します。空欄なら期限なし。
                    </p>
                  </div>
                  <div>
                    <label
                      htmlFor="invoice_subject"
                      className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                    >
                      件名（任意）
                    </label>
                    <input
                      id="invoice_subject"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="例: 2026年4月分整備代金として"
                      disabled={generating}
                      maxLength={120}
                      className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-50 dark:focus:ring-zinc-50"
                    />
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      請求書の合計金額の上に「件名: ◯◯」として表示します。未入力なら表示しません。
                    </p>
                  </div>
                </div>
              )}

              {/* 領収書を選んだときのみ但し書き・領収日を表示。 */}
              {selected.receipt && (
                <div className="mt-4 space-y-4">
                  <div>
                    <label
                      htmlFor="receipt_note"
                      className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                    >
                      領収書の但し書き
                    </label>
                    <input
                      id="receipt_note"
                      value={receiptNote}
                      onChange={(e) => setReceiptNote(e.target.value)}
                      placeholder={DEFAULT_RECEIPT_NOTE}
                      disabled={generating}
                      maxLength={100}
                      className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-50 dark:focus:ring-zinc-50"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="receipt_date"
                      className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                    >
                      領収日
                    </label>
                    <input
                      id="receipt_date"
                      type="date"
                      value={receiptDate}
                      onChange={(e) => setReceiptDate(e.target.value)}
                      disabled={generating}
                      className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-50 dark:focus:ring-zinc-50"
                    />
                  </div>
                </div>
              )}

              {error && (
                <p
                  role="alert"
                  className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
                >
                  {error}
                </p>
              )}

              <div className="mt-6 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={generating}
                  className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={generate}
                  disabled={generating || chosen.length === 0}
                  className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {generating ? "生成中..." : "PDFを出力"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
