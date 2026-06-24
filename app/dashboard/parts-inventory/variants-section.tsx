"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import type { PartsInventoryVariant } from "@/lib/types";
import {
  createVariant,
  softDeleteVariant,
  updateVariant,
  type VariantFormState,
} from "./variants-actions";

type Props = {
  partId: string;
  initial: PartsInventoryVariant[];
};

// 部品編集ページに同居するセクション。二階建て構造の「二階＝売り方」を編集する。
//   標準（車種指定なし＝vehicle_tags が空）を上に、車種別（タグあり）を下に並べる。
// 各 variant は独立した小フォームで個別に保存・削除する（部品本体フォームとは別系統）。
// 追加・更新・削除はいずれも server action 完了後に revalidatePath → router.refresh で
// 親 SSR から再取得し、initial が新しい配列で再描画される。
export default function VariantsSection({ partId, initial }: Props) {
  const [addingSpecific, setAddingSpecific] = useState(false);
  const [addingGeneral, setAddingGeneral] = useState(false);

  // 標準（車種空）と車種別（タグあり）に振り分ける。標準は通常1件。
  const general = initial.filter((v) => v.vehicle_tags.length === 0);
  const specific = initial.filter((v) => v.vehicle_tags.length > 0);

  return (
    <section className="wos-card">
      <div className="wos-sec-label mb-1">売価（標準・車種別）</div>
      <p className="mb-4 text-xs text-[var(--color-ink-light)]">
        この部品の「社内品番＋定価＋掛率」を売り方ごとに登録します。原価・仕入れ品番・在庫は上の本体側で共通です。受注では車種が一致する車種別を優先し、無ければ標準の定価が明細に流れます。
      </p>

      {/* 標準（車種指定なし）。普通に登録した部品はここ1件を持つ。 */}
      <div className="mb-5">
        <div className="mb-2 text-xs font-semibold text-[var(--color-ink-mid)]">
          標準価格（車種指定なし）
        </div>
        <div className="space-y-3">
          {general.map((v) => (
            <VariantCard key={v.id} variant={v} />
          ))}
          {general.length === 0 &&
            (addingGeneral ? (
              <NewVariantCard
                partId={partId}
                hideTags
                onDone={() => setAddingGeneral(false)}
              />
            ) : (
              <div>
                <p className="mb-2 text-sm text-[var(--color-ink-light)]">
                  標準価格がありません。受注で車種一致が無いとき、この価格が使われます。
                </p>
                <button
                  type="button"
                  onClick={() => setAddingGeneral(true)}
                  className="wos-btn-ghost wos-btn-sm"
                >
                  ＋ 標準価格を追加
                </button>
              </div>
            ))}
        </div>
      </div>

      {/* 車種別（特定車種のときだけ追加する）。 */}
      <div>
        <div className="mb-2 text-xs font-semibold text-[var(--color-ink-mid)]">
          車種別価格
        </div>
        <div className="space-y-3">
          {specific.length === 0 && !addingSpecific && (
            <p className="text-sm text-[var(--color-ink-light)]">
              まだありません。特定車種で品番・定価を変えたいときに「＋ 車種別を追加」してください。
            </p>
          )}

          {specific.map((v) => (
            <VariantCard key={v.id} variant={v} />
          ))}

          {addingSpecific ? (
            <NewVariantCard
              partId={partId}
              onDone={() => setAddingSpecific(false)}
            />
          ) : (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setAddingSpecific(true)}
                className="wos-btn-ghost wos-btn-sm"
              >
                ＋ 車種別を追加
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// 既存 variant 1 行ぶんの編集カード。defaultValue で初期値、保存で updateVariant。
function VariantCard({ variant }: { variant: PartsInventoryVariant }) {
  const router = useRouter();
  const updateAction = updateVariant.bind(null, variant.id);
  const [state, formAction, pending] = useActionState<
    VariantFormState,
    FormData
  >(updateAction, undefined);
  const [deleting, startDelete] = useTransition();
  const [savedFlash, setSavedFlash] = useState(false);

  // 保存成功時は親 SSR を再取得して initial を更新する。
  useEffect(() => {
    if (state && "success" in state) {
      setSavedFlash(true);
      router.refresh();
      const t = setTimeout(() => setSavedFlash(false), 1500);
      return () => clearTimeout(t);
    }
  }, [state, router]);

  function handleDelete() {
    const label = variant.part_number ?? "（品番なし）";
    if (!confirm(`「${label}」の組を削除しますか？（後から復元はできません）`)) {
      return;
    }
    startDelete(async () => {
      const r = await softDeleteVariant(variant.id);
      if ("error" in r) {
        alert(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <form
      action={formAction}
      className="border border-[var(--color-line)] bg-[var(--color-cream)] p-3 space-y-3"
    >
      <div>
        <label className="wos-label">
          社内品番{" "}
          <span className="text-xs text-[var(--color-ink-light)]">
            （お客様に見せる品番）
          </span>
        </label>
        <input
          name="part_number"
          defaultValue={variant.part_number ?? ""}
          className="wos-input"
          placeholder="例: 3XV-23135-20"
        />
      </div>

      <PriceMarkupGroup
        initialListPrice={variant.list_price}
        initialMarkupRate={variant.markup_rate}
      />

      <div>
        <label className="wos-label">適合車種</label>
        <VehicleTagsInput name="vehicle_tags" initial={variant.vehicle_tags} />
        <p className="mt-1 text-xs text-[var(--color-ink-light)]">
          Enter または カンマで確定 / × で削除 / Backspace で末尾削除
        </p>
      </div>

      {state && "error" in state && (
        <p role="alert" className="wos-alert warn">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending || deleting}
          className="wos-btn wos-btn-sm"
        >
          {pending ? "保存中…" : "更新"}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending || deleting}
          className="wos-btn-danger wos-btn-sm"
        >
          {deleting ? "削除中…" : "削除"}
        </button>
        {savedFlash && (
          <span className="text-xs text-[var(--color-ink-light)]">保存しました</span>
        )}
      </div>
    </form>
  );
}

// 新規追加カード。成功したらフォームを閉じる（onDone）。
// hideTags=true（標準価格の追加）のときは適合車種入力を出さず、空タグ（汎用）で送る。
function NewVariantCard({
  partId,
  onDone,
  hideTags = false,
}: {
  partId: string;
  onDone: () => void;
  hideTags?: boolean;
}) {
  const router = useRouter();
  const createAction = createVariant.bind(null, partId);
  const [state, formAction, pending] = useActionState<
    VariantFormState,
    FormData
  >(createAction, undefined);

  useEffect(() => {
    if (state && "success" in state) {
      router.refresh();
      onDone();
    }
  }, [state, router, onDone]);

  return (
    <form
      action={formAction}
      className="border border-[var(--color-line)] bg-[var(--color-paper)] p-3 space-y-3"
    >
      <div>
        <label className="wos-label">
          社内品番{" "}
          <span className="text-xs text-[var(--color-ink-light)]">
            （お客様に見せる品番）
          </span>
        </label>
        <input
          name="part_number"
          className="wos-input"
          placeholder="例: 3XV-23135-20"
          autoFocus
        />
      </div>

      <PriceMarkupGroup initialListPrice={null} initialMarkupRate={null} />

      {hideTags ? (
        // 標準価格は車種空（汎用）。サーバー契約に合わせ空配列を hidden で送る。
        <input type="hidden" name="vehicle_tags" value="[]" />
      ) : (
        <div>
          <label className="wos-label">適合車種</label>
          <VehicleTagsInput name="vehicle_tags" initial={[]} />
          <p className="mt-1 text-xs text-[var(--color-ink-light)]">
            Enter または カンマで確定 / × で削除 / Backspace で末尾削除
          </p>
        </div>
      )}

      {state && "error" in state && (
        <p role="alert" className="wos-alert warn">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="wos-btn wos-btn-sm"
        >
          {pending ? "追加中…" : "この組を追加"}
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={pending}
          className="wos-btn-ghost wos-btn-sm"
        >
          キャンセル
        </button>
      </div>
    </form>
  );
}

// 定価・掛け率(%)・業販価格の3列を双方向に連動させる入力グループ。
//   定価 (list_price)    : name="list_price" で通常送信
//   掛け率 (markup_rate) : name="markup_rate" で hidden 送信（%入力を /100 した小数）
//   業販価格            : 送信しない（計算/表示のみ。markup_rate と list_price から都度算出）
// 連動ルール:
//   - 掛け率変更 → 業販 = 定価 × 掛け率/100 を再表示
//   - 業販変更   → 掛け率 = 業販 / 定価 × 100 を再表示
//   - 定価変更   → 掛け率が入っていれば業販を追従、なければ業販があれば掛け率を再計算
//   - 定価が空/0 のとき、業販欄は disabled + 「定価未設定」表示。掛け率だけ入力可。
export function PriceMarkupGroup({
  initialListPrice,
  initialMarkupRate,
}: {
  initialListPrice: number | null;
  initialMarkupRate: number | null;
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

  const listPriceEmpty =
    listPrice.trim() === "" || !(Number(listPrice) > 0);

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div>
        <label className="wos-label">定価</label>
        <input
          name="list_price"
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
      <input type="hidden" name="markup_rate" value={markupRateValue} />
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
