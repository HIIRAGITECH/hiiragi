"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatYen } from "@/lib/format";
import {
  commitPasteStockIn,
  lookupDeliveryNote,
  type CommitLine,
} from "./paste-in-actions";

// 照合に使うテナントの部品（page.tsx から渡す）。参考定価(list_prices)は表示のみ・更新しない。
export type PastePart = {
  id: string;
  name: string;
  external_code: string | null;
  cost_price: number;
  unit: string | null;
  list_prices: number[];
};

// 貼り付け1行を解析した生データ。
type RawLine = {
  code: string; // 品番（仕入れ品番）
  name: string; // 品名
  quantity: number | null; // 数量
  unitCost: number | null; // 単価（原価）
  retail: number | null; // 希望小売価格（参考のみ）
};

// 確認画面での1行の状態。
type Row = {
  raw: RawLine;
  matches: PastePart[];
  include: boolean;
  // 選択中の扱い: 部品id=既存として入庫 / "__new__"=新規登録 / ""=未選択（重複で未確定）
  selection: string;
  // 既存・原価差異があるときに原価を更新するか（既定ON）
  updateCost: boolean;
  // 新規登録の編集フィールド（初期値は納品書の値）
  newName: string;
  newCode: string;
  newCost: string;
  newUnit: string;
};

// 数値の緩い解釈: 全角→半角、¥・カンマ・空白を除去して数値化。空や不正は null。
function parseNumber(s: string): number | null {
  const t = s.normalize("NFKC").replace(/[^0-9.\-]/g, "");
  if (t === "" || t === "-" || t === ".") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const HEADER_TOKENS = ["品番", "品名", "数量", "単価", "希望小売", "定価", "数 量"];

function isHeaderRow(cells: string[]): boolean {
  const joined = cells.join(" ");
  return HEADER_TOKENS.some((t) => joined.includes(t));
}

// 照合キーの正規化: trim + NFKC + 小文字化。
function normCode(s: string | null | undefined): string {
  return (s ?? "").trim().normalize("NFKC").toLowerCase();
}

type Gate = {
  canConfirm: boolean;
  blockReason: string | null;
  counts: { newCount: number; existCount: number } | null;
};

// 確定可否の判定。取り込む行のうち、重複未選択・新規の品名未入力があれば確定不可。
function computeGate(rows: Row[] | null): Gate {
  if (!rows) return { canConfirm: false, blockReason: null, counts: null };
  const included = rows.filter((r) => r.include);
  if (included.length === 0)
    return { canConfirm: false, blockReason: "入庫する行がありません。", counts: null };
  let newCount = 0;
  let existCount = 0;
  for (const r of included) {
    if (r.selection === "")
      return {
        canConfirm: false,
        blockReason: "品番が重複している行の照合先を選んでください。",
        counts: null,
      };
    if (r.selection === "__new__") {
      if (r.newName.trim() === "")
        return {
          canConfirm: false,
          blockReason: "新規登録する行の品名を入力してください。",
          counts: null,
        };
      newCount += 1;
    } else {
      existCount += 1;
    }
  }
  return { canConfirm: true, blockReason: null, counts: { newCount, existCount } };
}

// 確認画面のグループ。手を動かす必要が大きい順（上ほど要対応）。
//   1 選択が必要（品番重複・確定ブロック） → 2 新規登録 → 3 既存・原価変更あり
//   → 4 既存・原価変更なし → 5 取り込まない（除外）
const GROUP_META: { g: 1 | 2 | 3 | 4 | 5; title: string }[] = [
  { g: 1, title: "① 選択が必要（品番が重複）" },
  { g: 2, title: "② 新規登録" },
  { g: 3, title: "③ 既存・原価に変更あり" },
  { g: 4, title: "④ 既存・原価に変更なし" },
  { g: 5, title: "取り込まない（除外）" },
];

function classifyGroup(r: Row, parts: PastePart[]): 1 | 2 | 3 | 4 | 5 {
  if (!r.include) return 5;
  if (r.selection === "") return 1; // 重複で未選択（ambiguous のみ発生）
  if (r.selection === "__new__") return 2;
  const target = parts.find((p) => p.id === r.selection);
  const costDiff =
    target != null &&
    r.raw.unitCost != null &&
    r.raw.unitCost !== target.cost_price;
  return costDiff ? 3 : 4;
}

export default function PasteStockInForm({ parts }: { parts: PastePart[] }) {
  const [raw, setRaw] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [skippedInvalid, setSkippedInvalid] = useState(0);

  const [deliveryNoteNo, setDeliveryNoteNo] = useState("");
  const [supplier, setSupplier] = useState("");
  const [note, setNote] = useState("");
  const [dupWarn, setDupWarn] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ created: number; updated: number } | null>(
    null,
  );

  // 仕入れ品番 → 部品配列（正規化キーで引く）。
  const partsByCode = useMemo(() => {
    const map = new Map<string, PastePart[]>();
    for (const p of parts) {
      const key = normCode(p.external_code);
      if (key === "") continue;
      const arr = map.get(key);
      if (arr) arr.push(p);
      else map.set(key, [p]);
    }
    return map;
  }, [parts]);

  function handleParse() {
    setError(null);
    setDone(null);
    const lines = raw.split(/\r?\n/);
    const parsed: Row[] = [];
    let invalid = 0;
    for (const line of lines) {
      if (line.trim() === "") continue; // 空行は無視
      const cells = line.split("\t").map((c) => c.trim());
      if (cells.every((c) => c === "")) continue;
      if (isHeaderRow(cells)) continue; // ヘッダー行は無視

      const rl: RawLine = {
        code: cells[0] ?? "",
        name: cells[1] ?? "",
        quantity: parseNumber(cells[2] ?? ""),
        unitCost: parseNumber(cells[3] ?? ""),
        retail: parseNumber(cells[4] ?? ""),
      };
      // 数量が読めない/0以下の行は取り込めないので除外（件数だけ通知）。
      if (rl.quantity === null || rl.quantity <= 0) {
        invalid += 1;
        continue;
      }

      const matches = partsByCode.get(normCode(rl.code)) ?? [];
      const selection =
        matches.length === 1
          ? matches[0].id
          : matches.length === 0
            ? "__new__"
            : ""; // 2件以上は未選択（ユーザーが選ぶまで確定不可）

      parsed.push({
        raw: rl,
        matches,
        include: true,
        selection,
        updateCost: true,
        newName: rl.name,
        newCode: rl.code,
        newCost: rl.unitCost != null ? String(rl.unitCost) : "",
        newUnit: "",
      });
    }
    setRows(parsed);
    setSkippedInvalid(invalid);
  }

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((prev) =>
      prev ? prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) : prev,
    );
  }

  // 確定可否とその理由（rows から都度算出。React Compiler がメモ化する）。
  const gate = computeGate(rows);
  const { canConfirm, blockReason, counts } = gate;

  async function handleDeliveryNoteBlur() {
    setDupWarn(null);
    const no = deliveryNoteNo.trim();
    if (no === "") return;
    const res = await lookupDeliveryNote(no);
    if (res.exists) {
      const when = res.lastAt
        ? new Date(res.lastAt).toLocaleString("ja-JP")
        : "";
      setDupWarn(
        `納品書番号「${no}」は既に入庫済みです${when ? `（前回: ${when}）` : ""}。二重入庫にご注意ください。`,
      );
    }
  }

  async function handleConfirm() {
    if (!rows || !canConfirm) return;
    setBusy(true);
    setError(null);
    const lines: CommitLine[] = [];
    for (const r of rows) {
      if (!r.include) continue;
      if (r.selection === "__new__") {
        const cost = parseNumber(r.newCost);
        lines.push({
          action: "new",
          name: r.newName.trim(),
          external_code: r.newCode.trim() === "" ? null : r.newCode.trim(),
          unit: r.newUnit.trim() === "" ? null : r.newUnit.trim(),
          supplier: supplier.trim() === "" ? null : supplier.trim(),
          quantity: r.raw.quantity!,
          unit_cost: cost,
        });
      } else {
        const target = parts.find((p) => p.id === r.selection);
        const costDiff =
          r.raw.unitCost != null &&
          target != null &&
          r.raw.unitCost !== target.cost_price;
        lines.push({
          action: "existing",
          part_id: r.selection,
          quantity: r.raw.quantity!,
          unit_cost: r.raw.unitCost,
          // 原価差異があり、かつチェックONのときだけマスター原価を更新する。
          update_cost: costDiff && r.updateCost,
        });
      }
    }

    const res = await commitPasteStockIn({
      delivery_note_no: deliveryNoteNo.trim() === "" ? null : deliveryNoteNo.trim(),
      supplier: supplier.trim() === "" ? null : supplier.trim(),
      note: note.trim() === "" ? null : note.trim(),
      lines,
    });
    setBusy(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setDone({ created: res.created, updated: res.updated });
    setRows(null);
    setRaw("");
  }

  // 確定後の完了表示。
  if (done) {
    return (
      <div className="wos-card space-y-4 text-sm">
        <p className="wos-alert info">
          入庫を確定しました。既存部品の入庫 {done.updated} 件 / 新規登録 {done.created} 件。
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            className="wos-btn wos-btn-sm"
            onClick={() => setDone(null)}
          >
            続けて貼り付け入庫
          </button>
          <Link
            href="/dashboard/parts-inventory"
            className="wos-btn-ghost wos-btn-sm"
          >
            一覧へ戻る
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 貼り付け入力 */}
      <div className="wos-card space-y-4">
        <div>
          <label htmlFor="paste" className="wos-label">
            納品書の表を貼り付け（タブ区切り／5列：品番・品名・数量・単価・希望小売価格）
          </label>
          <textarea
            id="paste"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={8}
            className="wos-textarea font-mono text-xs"
            placeholder={
              "BC6-23141-01\tスプリングフロントフォーク\t2\t2684\t3050\n51173-01H00\tシールダスト\t1\t369\t410"
            }
          />
          <p className="mt-1 text-xs text-[var(--color-ink-light)]">
            スプレッドシートやPDFから起こした表をそのまま貼り付けてください。ヘッダー行・空行は自動で無視します。
          </p>
        </div>
        <div>
          <button
            type="button"
            className="wos-btn wos-btn-sm"
            onClick={handleParse}
            disabled={raw.trim() === ""}
          >
            解析して照合する
          </button>
        </div>
      </div>

      {rows && (
        <>
          {/* 納品書メタ（任意） */}
          <div className="wos-card grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="dn" className="wos-label">
                納品書番号{" "}
                <span className="text-xs text-[var(--color-ink-light)]">（任意）</span>
              </label>
              <input
                id="dn"
                value={deliveryNoteNo}
                onChange={(e) => setDeliveryNoteNo(e.target.value)}
                onBlur={handleDeliveryNoteBlur}
                className="wos-input"
                placeholder="例: 12345"
              />
            </div>
            <div>
              <label htmlFor="sp" className="wos-label">
                仕入先{" "}
                <span className="text-xs text-[var(--color-ink-light)]">（任意）</span>
              </label>
              <input
                id="sp"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                className="wos-input"
                placeholder="例: カスタムジャパン"
              />
            </div>
            <div>
              <label htmlFor="nt" className="wos-label">
                備考{" "}
                <span className="text-xs text-[var(--color-ink-light)]">（任意）</span>
              </label>
              <input
                id="nt"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="wos-input"
              />
            </div>
            {dupWarn && (
              <p className="wos-alert warn sm:col-span-3">⚠ {dupWarn}</p>
            )}
          </div>

          {skippedInvalid > 0 && (
            <p className="wos-alert warn">
              数量が読み取れない {skippedInvalid} 行を除外しました。貼り付け内容をご確認ください。
            </p>
          )}

          {rows.length === 0 ? (
            <div className="wos-card text-center py-8 text-sm text-[var(--color-ink-light)]">
              取り込める行がありませんでした。タブ区切り（5列）で貼り付けているかご確認ください。
            </div>
          ) : (
            // 手を動かす必要が大きい順にグループ分けして表示する（上ほど要対応）。
            // 元の index を保って onChange を配線するため、classifyGroup で並べ替えつつ i を保持する。
            <div className="space-y-6">
              {GROUP_META.map(({ g, title }) => {
                const items = rows
                  .map((r, i) => ({ r, i }))
                  .filter(({ r }) => classifyGroup(r, parts) === g);
                if (items.length === 0) return null;
                return (
                  <div key={g} className="space-y-3">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-ink)]">
                      {title}
                      <span className="border border-[var(--color-line)] px-2 py-0.5 text-[11px] font-normal text-[var(--color-ink-mid)]">
                        {items.length} 件
                      </span>
                    </h3>
                    {items.map(({ r, i }) => (
                      <RowCard
                        key={i}
                        row={r}
                        parts={parts}
                        onChange={(patch) => updateRow(i, patch)}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {/* フッター: 確定 */}
          <div className="wos-card flex flex-wrap items-center gap-4">
            <button
              type="button"
              className="wos-btn wos-btn-sm"
              onClick={handleConfirm}
              disabled={!canConfirm || busy}
            >
              {busy ? "確定中…" : "確定して入庫する"}
            </button>
            {counts && (
              <span className="text-xs text-[var(--color-ink-mid)]">
                既存部品の入庫 {counts.existCount} 件 / 新規登録 {counts.newCount} 件
              </span>
            )}
            {blockReason && (
              <span className="text-xs text-[var(--color-ink-light)]">
                {blockReason}
              </span>
            )}
            <span className="ml-auto text-xs text-[var(--color-ink-light)]">
              「確定」を押すまで在庫・原価は変更されません。
            </span>
          </div>
          {error && <p className="wos-alert warn">{error}</p>}
        </>
      )}
    </div>
  );
}

// 1行の確認カード。扱い（既存・原価変更あり／なし・新規・重複選択）を出し分ける。
function RowCard({
  row,
  parts,
  onChange,
}: {
  row: Row;
  parts: PastePart[];
  onChange: (patch: Partial<Row>) => void;
}) {
  const { raw, matches } = row;
  const isNew = row.selection === "__new__";
  const isAmbiguous = matches.length > 1;
  const target =
    !isNew && row.selection !== ""
      ? parts.find((p) => p.id === row.selection) ?? null
      : null;

  const costDiff =
    target != null && raw.unitCost != null && raw.unitCost !== target.cost_price;

  return (
    <div
      className={`wos-card ${row.include ? "" : "opacity-50"} space-y-3`}
    >
      {/* ヘッダ行: 取り込みトグル＋納品書の生データ */}
      <div className="flex flex-wrap items-start gap-3">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={row.include}
            onChange={(e) => onChange({ include: e.target.checked })}
          />
          取り込む
        </label>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-[var(--color-ink)]">
            {raw.name || "（品名なし）"}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-[var(--color-ink-light)]">
            <span>品番: {raw.code || "—"}</span>
            <span>数量: {raw.quantity}</span>
            <span>単価: {raw.unitCost != null ? formatYen(raw.unitCost) : "—"}</span>
            <span>
              希望小売価格: {raw.retail != null ? formatYen(raw.retail) : "—"}
              <span className="ml-1 opacity-70">（参考）</span>
            </span>
          </div>
        </div>
        <StatusChip isNew={isNew} isAmbiguous={isAmbiguous} unresolved={row.selection === ""} costDiff={costDiff} />
      </div>

      {row.include && (
        <div className="border-t border-[var(--color-line)] pt-3">
          {/* 重複（2件以上）: 候補から選ぶ。選ぶまで確定不可。 */}
          {isAmbiguous && (
            <div className="space-y-2">
              <p className="text-xs text-[var(--color-ink-mid)]">
                この品番に一致する部品が複数あります。入庫先を選んでください。
              </p>
              {matches.map((m) => (
                <label
                  key={m.id}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <input
                    type="radio"
                    name={`sel-${raw.code}-${raw.name}`}
                    checked={row.selection === m.id}
                    onChange={() => onChange({ selection: m.id })}
                  />
                  <span className="font-medium">{m.name}</span>
                  <span className="text-xs text-[var(--color-ink-light)]">
                    仕入れ品番 {m.external_code ?? "—"} ／ 原価 {formatYen(m.cost_price)}
                  </span>
                </label>
              ))}
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={`sel-${raw.code}-${raw.name}`}
                  checked={row.selection === "__new__"}
                  onChange={() => onChange({ selection: "__new__" })}
                />
                <span>どれでもない（新規登録する）</span>
              </label>
            </div>
          )}

          {/* 既存部品: 原価差異の有無で表示を出し分け。 */}
          {!isNew && target && (
            <div className="space-y-2 text-sm">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="text-[var(--color-ink-mid)]">
                  入庫先: <span className="font-medium text-[var(--color-ink)]">{target.name}</span>
                </span>
                <span className="text-[var(--color-ink-mid)]">
                  入庫数量:{" "}
                  <span className="font-semibold">
                    +{raw.quantity}
                    {target.unit ? ` ${target.unit}` : ""}
                  </span>
                </span>
              </div>

              {costDiff ? (
                <div className="space-y-2 border border-[var(--color-line)] bg-[var(--color-cream)] px-3 py-2">
                  <div className="text-[var(--color-ink)]">
                    原価 {formatYen(target.cost_price)} →{" "}
                    <span className="font-semibold">{formatYen(raw.unitCost!)}</span> 円
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={row.updateCost}
                      onChange={(e) => onChange({ updateCost: e.target.checked })}
                    />
                    この原価に更新する
                  </label>
                  {/* 参考情報（表示のみ・更新しない）。 */}
                  <div className="flex flex-wrap gap-x-4 text-xs text-[var(--color-ink-light)]">
                    <span>納品書の希望小売価格: {raw.retail != null ? formatYen(raw.retail) : "—"}</span>
                    <span>
                      現在の定価（アプリ）:{" "}
                      {target.list_prices.length > 0
                        ? target.list_prices.map((v) => formatYen(v)).join(" / ")
                        : "—"}
                    </span>
                  </div>
                  <p className="text-[10px] text-[var(--color-ink-light)]">
                    ※ 定価はアプリ側で決めた売値です。希望小売価格・原価とは無関係で、ここでは変更しません。
                  </p>
                </div>
              ) : (
                <div className="text-xs text-[var(--color-ink-light)]">
                  原価に変更はありません（{formatYen(target.cost_price)}）。在庫数のみ加算します。
                </div>
              )}
            </div>
          )}

          {/* 新規登録: その場で編集して登録。 */}
          {isNew && (
            <div className="space-y-3">
              <p className="text-xs text-[var(--color-ink-mid)]">
                一致する部品がありません。新規部品として登録します（在庫の追跡はOFF・定価は空で登録）。
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="wos-label">品名<span className="wos-req">*</span></label>
                  <input
                    value={row.newName}
                    onChange={(e) => onChange({ newName: e.target.value })}
                    className="wos-input"
                  />
                </div>
                <div>
                  <label className="wos-label">仕入れ品番</label>
                  <input
                    value={row.newCode}
                    onChange={(e) => onChange({ newCode: e.target.value })}
                    className="wos-input"
                  />
                </div>
                <div>
                  <label className="wos-label">原価</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={row.newCost}
                    onChange={(e) => onChange({ newCost: e.target.value })}
                    className="wos-input text-right"
                  />
                </div>
                <div>
                  <label className="wos-label">
                    単位{" "}
                    <span className="text-xs text-[var(--color-ink-light)]">（任意）</span>
                  </label>
                  <input
                    value={row.newUnit}
                    onChange={(e) => onChange({ newUnit: e.target.value })}
                    className="wos-input"
                    placeholder="例: 個 / 本"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-x-4 text-xs text-[var(--color-ink-light)]">
                <span>入庫数量: +{raw.quantity}</span>
                <span>
                  納品書の希望小売価格: {raw.retail != null ? formatYen(raw.retail) : "—"}（参考・定価には入れません）
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusChip({
  isNew,
  isAmbiguous,
  unresolved,
  costDiff,
}: {
  isNew: boolean;
  isAmbiguous: boolean;
  unresolved: boolean;
  costDiff: boolean;
}) {
  let label = "既存部品";
  if (isAmbiguous && unresolved) label = "要選択（重複）";
  else if (isNew) label = "新規登録";
  else if (costDiff) label = "既存・原価変更あり";
  return (
    <span className="shrink-0 border border-[var(--color-line)] px-2 py-0.5 text-[11px] text-[var(--color-ink-mid)]">
      {label}
    </span>
  );
}
