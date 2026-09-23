"use client";

// 受注明細「作業内容 / 部品名」セル専用の入力欄（スプレッドシート化 2026-09）。
//
// 役割はこの2つだけに閉じる:
//   1) 日本語入力(IME)の変換中を判定し、変換中の Enter は「変換確定」だけに使う
//      （候補の選択・決定・フォーム送信を一切起こさない）。
//   2) 変換確定後（半角英数字は打った時点）に、部品在庫と作業メニューの候補を出し、
//      ↓↑で選択・Enter/クリックで決定・Esc で閉じる。
//
// ★ 行を作る計算はここには持たせない。決定時に「どの部品/どのメニューが選ばれたか」を
//   onPick で親に通知するだけ。行の生成は親が既存の rowFromPart / rowFromMenu を呼ぶ
//   （＝既存モーダルから追加した行と完全に同じ中身になることを保証する）。
//
// 候補が出ていないときの挙動は素の <input> と同じ（Enter は今までどおりフォーム送信に委ねる）。
// この欄は PC 幅（md 以上）想定で使う。スマホ幅では親が素の入力に切り替える。

import { useId, useMemo, useRef, useState } from "react";
import type { PartsInventory, WorkMenuItem } from "@/lib/types";
import { formatYen } from "@/lib/format";

// 決定された候補。part = 部品在庫、menu = 作業メニュー。
export type SuggestChoice =
  | { type: "part"; part: PartsInventory }
  | { type: "menu"; menu: WorkMenuItem };

// 検索用の正規化（items-form.tsx の normalizeForSearch と同一: 小文字化 + NFKC）。
function normalizeForSearch(s: string): string {
  return s.toLowerCase().normalize("NFKC");
}

// 在庫バッジの色分け。parts-inventory-table.tsx の stockStatus() と同じ考え方に合わせる:
//   追跡しない部品(track_stock=false) = 中立グレー / 在庫<=0 = 赤(欠品) /
//   在庫<=発注点 = 黄(要発注) / それ以外 = 緑(在庫OK)。
type StockLevel = "untracked" | "out" | "low" | "ok";
function stockLevel(p: PartsInventory): StockLevel {
  if (!p.track_stock) return "untracked";
  if (Number(p.stock_quantity ?? 0) <= 0) return "out";
  if (Number(p.stock_quantity ?? 0) <= Number(p.reorder_point ?? 0)) return "low";
  return "ok";
}
const STOCK_BADGE_CLASS: Record<StockLevel, string> = {
  untracked:
    "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300",
  out: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300",
  low: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  ok: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
};

// 候補リストの上限。キーボード操作が破綻しない程度に抑える（超過分は末尾に件数だけ示す）。
const MAX_ITEMS = 20;

type Candidate =
  | { key: string; type: "part"; part: PartsInventory }
  | { key: string; type: "menu"; menu: WorkMenuItem };

export default function WorkNameSuggest({
  value,
  onChange,
  onPick,
  parts,
  menus,
  partNumbersByPart,
  partInsertPrice,
  menuInsertPrice,
  placeholder,
  ariaLabel,
  className,
}: {
  value: string;
  // 素のテキスト編集（今までの updateName と同じ）。
  onChange: (v: string) => void;
  // 候補を決定したときだけ呼ぶ。行の生成は親（既存 rowFromPart/rowFromMenu）が行う。
  onPick: (choice: SuggestChoice) => void;
  // 候補の出どころ（親が渡す。部品は明細に出せるもの＝ show_in_detail 済みの allParts）。
  parts: PartsInventory[];
  menus: WorkMenuItem[];
  // 部品ごとの variant.part_number（社内品番）一覧。検索対象＋社内品番表示に使う。
  partNumbersByPart: Map<string, string[]>;
  // 候補に出す単価。親が rowFromPart/rowFromMenu を通して算出し、挿入される金額と一致させる。
  partInsertPrice: (p: PartsInventory) => number;
  menuInsertPrice: (m: WorkMenuItem) => number;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listboxId = useId();

  const candidates = useMemo<Candidate[]>(() => {
    const q = value.trim();
    if (q === "") return [];
    const needle = normalizeForSearch(q);

    const partHits: Candidate[] = [];
    for (const p of parts) {
      const numbers = partNumbersByPart.get(p.id) ?? [];
      const haystack = normalizeForSearch(
        `${p.name} ${p.internal_code ?? ""} ${p.external_code ?? ""} ${numbers.join(" ")}`,
      );
      if (haystack.includes(needle)) {
        partHits.push({ key: `part_${p.id}`, type: "part", part: p });
      }
    }
    const menuHits: Candidate[] = [];
    for (const m of menus) {
      const haystack = normalizeForSearch(`${m.work_name} ${m.part_name ?? ""}`);
      if (haystack.includes(needle)) {
        menuHits.push({ key: `menu_${m.id}`, type: "menu", menu: m });
      }
    }
    // 部品→作業の順で並べ、合計を上限で切る。
    return [...partHits, ...menuHits].slice(0, MAX_ITEMS);
  }, [value, parts, menus, partNumbersByPart]);

  const totalHits = useMemo(() => {
    const q = value.trim();
    if (q === "") return 0;
    const needle = normalizeForSearch(q);
    let n = 0;
    for (const p of parts) {
      const numbers = partNumbersByPart.get(p.id) ?? [];
      if (
        normalizeForSearch(
          `${p.name} ${p.internal_code ?? ""} ${p.external_code ?? ""} ${numbers.join(" ")}`,
        ).includes(needle)
      )
        n++;
    }
    for (const m of menus) {
      if (
        normalizeForSearch(`${m.work_name} ${m.part_name ?? ""}`).includes(needle)
      )
        n++;
    }
    return n;
  }, [value, parts, menus, partNumbersByPart]);

  const showList = open && !composing && candidates.length > 0;

  function pick(c: Candidate) {
    setOpen(false);
    if (c.type === "part") onPick({ type: "part", part: c.part });
    else onPick({ type: "menu", menu: c.menu });
  }

  function handleChange(v: string) {
    onChange(v);
    // 変換中は候補を出さない（確定してから出す）。半角英数字は composing=false なので即出る。
    if (!composing) {
      setOpen(v.trim() !== "");
      setHighlight(0);
    }
  }

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={(e) => {
          // 変換確定。ここで初めて候補を出す。
          setComposing(false);
          const v = e.currentTarget.value;
          setOpen(v.trim() !== "");
          setHighlight(0);
        }}
        onFocus={() => {
          if (blurTimer.current) clearTimeout(blurTimer.current);
          if (value.trim() !== "") setOpen(true);
        }}
        onBlur={() => {
          // 候補クリック（onMouseDown）を拾えるよう少し遅らせて閉じる。
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={(e) => {
          // 変換中の Enter などは一切横取りしない（IME の確定に委ねる）。
          // isComposing / keyCode 229 の両方を見る（ブラウザ差の保険）。
          const composingNow =
            composing ||
            (e.nativeEvent as unknown as { isComposing?: boolean })
              .isComposing === true ||
            e.keyCode === 229;
          if (composingNow) return;

          // 候補が出ていないときは素の input と同じ挙動（Enter は既存のフォーム送信に委ねる）。
          if (!showList) return;

          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => (h + 1) % candidates.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => (h - 1 + candidates.length) % candidates.length);
          } else if (e.key === "Enter") {
            // 候補表示中の Enter は「決定」に使い、フォーム送信を止める。
            e.preventDefault();
            const c = candidates[highlight] ?? candidates[0];
            if (c) pick(c);
          } else if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
          } else if (e.key === "Tab") {
            // セル移動は今回入れない。候補だけ閉じてフォーカス移動は既定に任せる。
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listboxId}
        aria-autocomplete="list"
        className={className}
      />
      {showList && (
        <ul
          role="listbox"
          id={listboxId}
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-md border border-zinc-300 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          {candidates.map((c, idx) => {
            const active = idx === highlight;
            const activeClass = active
              ? "bg-zinc-100 dark:bg-zinc-800"
              : "hover:bg-zinc-50 dark:hover:bg-zinc-800/60";
            if (c.type === "menu") {
              const m = c.menu;
              return (
                <li key={c.key} role="option" aria-selected={active}>
                  <button
                    type="button"
                    // onMouseDown で拾う（input の blur より先に発火させ、決定を確実にする）。
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pick(c);
                    }}
                    onMouseEnter={() => setHighlight(idx)}
                    className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left ${activeClass}`}
                  >
                    <span className="shrink-0 rounded bg-sky-100 px-1 py-0.5 text-[9px] font-medium leading-none text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
                      作業
                    </span>
                    <span className="flex-1 truncate text-sm text-zinc-900 dark:text-zinc-50">
                      {m.work_name || m.part_name || "（名称なし）"}
                    </span>
                    <span className="shrink-0 text-xs text-zinc-600 dark:text-zinc-300">
                      {formatYen(menuInsertPrice(m))}
                    </span>
                  </button>
                </li>
              );
            }
            const p = c.part;
            const numbers = partNumbersByPart.get(p.id) ?? [];
            const internal = numbers.join(" / ");
            const level = stockLevel(p);
            return (
              <li key={c.key} role="option" aria-selected={active}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(c);
                  }}
                  onMouseEnter={() => setHighlight(idx)}
                  className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left ${activeClass}`}
                >
                  <span className="shrink-0 rounded bg-emerald-100 px-1 py-0.5 text-[9px] font-medium leading-none text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                    部品
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm text-zinc-900 dark:text-zinc-50">
                      {p.name}
                    </span>
                    {(internal || p.external_code) && (
                      <span className="truncate text-[10px] text-zinc-400 dark:text-zinc-500">
                        {internal ? `社内 ${internal}` : ""}
                        {internal && p.external_code ? "・" : ""}
                        {p.external_code ? `社外 ${p.external_code}` : ""}
                      </span>
                    )}
                  </span>
                  <span
                    className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-medium leading-none ${STOCK_BADGE_CLASS[level]}`}
                    title={
                      level === "untracked"
                        ? "在庫を追跡しない部品"
                        : "在庫数（発注点で色分け）"
                    }
                  >
                    在庫 {Number(p.stock_quantity ?? 0)}
                    {p.unit ? p.unit : ""}
                  </span>
                  <span className="shrink-0 text-xs text-zinc-600 dark:text-zinc-300">
                    {formatYen(partInsertPrice(p))}
                  </span>
                </button>
              </li>
            );
          })}
          {totalHits > candidates.length && (
            <li className="px-2.5 py-1 text-[10px] text-zinc-400 dark:text-zinc-500">
              ほか {totalHits - candidates.length} 件（絞り込んでください）
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
