"use client";

import { useRef, useState } from "react";
import type { PartsInventoryVariant } from "@/lib/types";

type Slot = {
  // フィールド名を一意化するためのキー。既存は variant.id、新規は new_<n>。
  key: string;
  // 既存なら variant.id、新規なら null。
  id: string | null;
  // 既存カードの初期値。新規は null。
  variant: PartsInventoryVariant | null;
};

function initialToSlots(initial: PartsInventoryVariant[]): Slot[] {
  // 車種空（全車種共通）を先頭に寄せ、あとは display_order 順で並べる。
  const sorted = [...initial].sort((a, b) => {
    const ea = a.vehicle_tags.length === 0 ? 0 : 1;
    const eb = b.vehicle_tags.length === 0 ? 0 : 1;
    if (ea !== eb) return ea - eb;
    return a.display_order - b.display_order;
  });
  return sorted.map((v) => ({ key: v.id, id: v.id, variant: v }));
}

// 価格カードを編集する本体。**自身は <form> を持たない**。部品本体フォームと同じ <form> の
// 子要素として置かれ、画面下の単一の「更新する」で本体とまとめて保存される
// （card_keys と各カードの隠しフィールドを同じフォームで送る）。
// カードの追加・削除はクライアント state。確定（DB 反映）は親フォームの submit に委ねる。
// 案A（車種空カードは1枚）と保存はサーバー側 updatePartAndVariants が担う。
export function VariantEditorFields({
  initial,
  seedEmpty = false,
}: {
  initial: PartsInventoryVariant[];
  // 新規登録で使うとき true。価格カードが 0 枚なら空の車種空カードを1枚だけ初期表示する
  // （「部品は必ず価格を持つ」運用を維持し、開いた瞬間に1枚並んでいる状態にする）。
  seedEmpty?: boolean;
}) {
  const [slots, setSlots] = useState<Slot[]>(() => {
    const s = initialToSlots(initial);
    if (s.length === 0 && seedEmpty) {
      return [{ key: "new_1", id: null, variant: null }];
    }
    return s;
  });
  // seedEmpty で new_1 を既に使った場合は 1 から続ける（次の追加が new_2 になる）。
  const newCounter = useRef(seedEmpty && initial.length === 0 ? 1 : 0);

  function addCard() {
    newCounter.current += 1;
    setSlots((prev) => [
      ...prev,
      { key: `new_${newCounter.current}`, id: null, variant: null },
    ]);
  }

  function removeCard(key: string) {
    setSlots((prev) => prev.filter((s) => s.key !== key));
  }

  return (
    <div>
      <div className="wos-sec-label mb-1">価格</div>
      <p className="mb-4 text-xs text-[var(--color-ink-light)]">
        社内品番・定価・業販掛け率を価格カードで登録します。原価・仕入れ品番・在庫は上の本体側で共通です。車種を指定しないカードが全車種共通の価格になり、受注で車種が一致しないときに使われます（全車種共通は1つだけ）。
      </p>

      <div className="space-y-3">
        {slots.length === 0 && (
          <p className="text-sm text-[var(--color-ink-light)]">
            価格カードがありません。「＋ 価格を追加」で作成してください。
          </p>
        )}

        {slots.map((slot) => (
          <PriceCard
            key={slot.key}
            slot={slot}
            onRemove={() => removeCard(slot.key)}
          />
        ))}
      </div>

      {/* 画面に並んでいるカードのキー一覧。サーバーはこれを辿って各カードを読む。 */}
      <input
        type="hidden"
        name="card_keys"
        value={JSON.stringify(slots.map((s) => s.key))}
      />

      <div className="mt-3">
        <button
          type="button"
          onClick={addCard}
          className="wos-btn-ghost wos-btn-sm"
        >
          ＋ 価格を追加
        </button>
      </div>
    </div>
  );
}

// 価格カード 1 枚。フィールド名は card_<key>_* で一意化し、1フォーム一括送信に乗せる。
// 値の保持は各入力コンポーネント内部（uncontrolled 相当）。削除は state から外すだけで、
// 確定（DB ソフト削除）は下の「更新する」で行う。
function PriceCard({ slot, onRemove }: { slot: Slot; onRemove: () => void }) {
  const v = slot.variant;
  const prefix = `card_${slot.key}_`;

  return (
    <div className="border border-[var(--color-line)] bg-[var(--color-cream)] p-3 space-y-3">
      {/* 既存カードは id を hidden で送る（新規は空）。 */}
      <input type="hidden" name={`${prefix}id`} value={slot.id ?? ""} />

      <div>
        <label className="wos-label">
          社内品番{" "}
          <span className="text-xs text-[var(--color-ink-light)]">
            （お客様に見せる品番）
          </span>
        </label>
        <input
          name={`${prefix}part_number`}
          defaultValue={v?.part_number ?? ""}
          className="wos-input"
          placeholder="例: 3XV-23135-20"
        />
      </div>

      <PriceMarkupGroup
        namePrefix={prefix}
        initialListPrice={v?.list_price ?? null}
        initialMarkupRate={v?.markup_rate ?? null}
      />

      <div>
        <label className="wos-label">
          適合車種{" "}
          <span className="text-xs text-[var(--color-ink-light)]">
            （空欄＝全車種共通）
          </span>
        </label>
        <VehicleTagsInput
          name={`${prefix}vehicle_tags`}
          initial={v?.vehicle_tags ?? []}
        />
        <p className="mt-1 text-xs text-[var(--color-ink-light)]">
          Enter または カンマで確定 / × で削除 / Backspace で末尾削除
        </p>
      </div>

      <div>
        <button
          type="button"
          onClick={onRemove}
          className="wos-btn-danger wos-btn-sm"
        >
          このカードを削除
        </button>
      </div>
    </div>
  );
}

// 定価・掛け率(%)・業販価格の3列を双方向に連動させる入力グループ。
//   定価 (list_price)    : name=`${namePrefix}list_price` で通常送信
//   掛け率 (markup_rate) : name=`${namePrefix}markup_rate` で hidden 送信（%入力を /100 した小数）
//   業販価格            : 送信しない（計算/表示のみ。markup_rate と list_price から都度算出）
// namePrefix 既定は ""（部品 新規登録フォームでの単独利用＝従来名 list_price/markup_rate のまま）。
// 連動ルール:
//   - 掛け率変更 → 業販 = 定価 × 掛け率/100 を再表示
//   - 業販変更   → 掛け率 = 業販 / 定価 × 100 を再表示
//   - 定価変更   → 掛け率が入っていれば業販を追従、なければ業販があれば掛け率を再計算
//   - 定価が空/0 のとき、業販欄は disabled + 「定価未設定」表示。掛け率だけ入力可。
export function PriceMarkupGroup({
  initialListPrice,
  initialMarkupRate,
  namePrefix = "",
}: {
  initialListPrice: number | null;
  initialMarkupRate: number | null;
  namePrefix?: string;
}) {
  // 初期 % 表示: 0.95 → "95"、95.5 のような小数 % も許容するため 1 桁まで保持。
  const initialPct =
    initialMarkupRate != null && Number.isFinite(initialMarkupRate)
      ? String(Math.round(initialMarkupRate * 1000) / 10)
      : "";
  // 初期 業販価格: 定価 × 掛け率 を整数丸めで表示。どちらか欠ければ空。
  const initialBulk =
    initialListPrice != null &&
    initialMarkupRate != null &&
    Number.isFinite(initialListPrice * initialMarkupRate)
      ? String(Math.round(initialListPrice * initialMarkupRate))
      : "";

  const [listPrice, setListPrice] = useState<string>(
    initialListPrice != null ? String(initialListPrice) : "",
  );
  const [markupPct, setMarkupPct] = useState<string>(initialPct);
  const [bulkPrice, setBulkPrice] = useState<string>(initialBulk);

  function recalcBulkFromRate(lp: string, pct: string): string {
    const lpN = Number(lp);
    const pctN = Number(pct);
    if (lp.trim() === "" || !Number.isFinite(lpN)) return "";
    if (pct.trim() === "" || !Number.isFinite(pctN)) return "";
    const b = lpN * (pctN / 100);
    return Number.isFinite(b) ? String(Math.round(b)) : "";
  }

  function recalcRateFromBulk(lp: string, bp: string): string {
    const lpN = Number(lp);
    const bpN = Number(bp);
    if (!Number.isFinite(lpN) || lpN <= 0) return "";
    if (bp.trim() === "" || !Number.isFinite(bpN)) return "";
    const pct = (bpN / lpN) * 100;
    return Number.isFinite(pct) ? String(Math.round(pct * 10) / 10) : "";
  }

  function onListPriceChange(v: string) {
    setListPrice(v);
    if (markupPct !== "") {
      // 掛け率を優先して業販を追従
      setBulkPrice(recalcBulkFromRate(v, markupPct));
    } else if (bulkPrice !== "") {
      // 掛け率が無くて業販があるなら、新定価に合わせて掛け率を再計算
      setMarkupPct(recalcRateFromBulk(v, bulkPrice));
    }
  }

  function onPctChange(v: string) {
    setMarkupPct(v);
    setBulkPrice(recalcBulkFromRate(listPrice, v));
  }

  function onBulkChange(v: string) {
    setBulkPrice(v);
    setMarkupPct(recalcRateFromBulk(listPrice, v));
  }

  // hidden で送る markup_rate は小数。空 → サーバー側 pickNullableNumber で null になる。
  const markupRateValue = (() => {
    if (markupPct.trim() === "") return "";
    const n = Number(markupPct);
    if (!Number.isFinite(n)) return "";
    return String(n / 100);
  })();

  const listPriceEmpty = listPrice.trim() === "" || !(Number(listPrice) > 0);

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div>
        <label className="wos-label">定価</label>
        <input
          name={`${namePrefix}list_price`}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={listPrice}
          onChange={(e) => onListPriceChange(e.target.value)}
          className="wos-input text-right"
          placeholder="例: 5590"
        />
      </div>
      <div>
        <label className="wos-label">業販掛け率(%)</label>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={1}
          value={markupPct}
          onChange={(e) => onPctChange(e.target.value)}
          className="wos-input text-right"
          placeholder="例: 95"
        />
      </div>
      <div>
        <label className="wos-label">業販価格</label>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={listPriceEmpty ? "" : bulkPrice}
          onChange={(e) => onBulkChange(e.target.value)}
          disabled={listPriceEmpty}
          className={`wos-input text-right ${
            listPriceEmpty ? "cursor-not-allowed opacity-60" : ""
          }`}
          placeholder={listPriceEmpty ? "定価未設定" : "例: 5310"}
        />
      </div>
      <input type="hidden" name={`${namePrefix}markup_rate`} value={markupRateValue} />
    </div>
  );
}

// チップ表示 + 自由入力。Enter/カンマで確定、× で削除、Backspace（入力空のとき）で末尾削除。
// 送信時は hidden input に JSON 配列を入れる（サーバー側 pickStringArray と契約）。
function VehicleTagsInput({
  name,
  initial,
}: {
  name: string;
  initial: string[];
}) {
  const [tags, setTags] = useState<string[]>(initial);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function commit(raw: string) {
    const candidates = raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== "");
    if (candidates.length === 0) return;
    setTags((prev) => {
      const seen = new Set(prev);
      const next = [...prev];
      for (const c of candidates) {
        if (!seen.has(c)) {
          seen.add(c);
          next.push(c);
        }
      }
      return next;
    });
    setInput("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit(input);
      return;
    }
    if (e.key === "Backspace" && input === "" && tags.length > 0) {
      e.preventDefault();
      setTags((prev) => prev.slice(0, -1));
    }
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    // 末尾がカンマなら即確定（IME 中の偶発的カンマも拾えるよう onChange で）。
    if (v.endsWith(",")) {
      commit(v.slice(0, -1));
    } else {
      setInput(v);
    }
  }

  function onBlur() {
    if (input.trim() !== "") commit(input);
  }

  function remove(t: string) {
    setTags((prev) => prev.filter((x) => x !== t));
    inputRef.current?.focus();
  }

  return (
    <>
      <div
        className="flex flex-wrap gap-1.5 items-center min-h-[2.5rem] border border-[var(--color-line-strong)] bg-[var(--color-paper)] px-2 py-1.5 cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((t) => (
          <span
            key={t}
            className="wos-chip active inline-flex items-center gap-1.5"
          >
            <span>{t}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                remove(t);
              }}
              className="opacity-70 hover:opacity-100"
              aria-label={`${t} を削除`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          placeholder={tags.length === 0 ? "例: グース, GSX400 …" : ""}
          className="flex-1 min-w-[8rem] bg-transparent outline-none text-sm py-1"
        />
      </div>
      <input type="hidden" name={name} value={JSON.stringify(tags)} />
    </>
  );
}
