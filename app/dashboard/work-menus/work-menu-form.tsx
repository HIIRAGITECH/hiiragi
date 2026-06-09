"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { moneyDefault } from "@/lib/forms/money-default";
import type {
  PartsInventory,
  TaxCategory,
  WorkItemCategory,
  WorkMenuItem,
} from "@/lib/types";
import type { FormState } from "./actions";

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  initial?: WorkMenuItem;
  // 選択肢として表示するアクティブな業務カテゴリ。display_order 順で渡されている前提。
  // initial.item_category_id が deleted_at 等で含まれない場合に備えて、
  // 親ページ側で initial のカテゴリも合流させて渡してもよい。
  allCategories: WorkItemCategory[];
  // 部品マスター（間接材料セレクト用。deleted_at IS NULL のアクティブ行のみ、display_order 順）。
  allParts: PartsInventory[];
  // 初期の間接材料リスト（編集時のみ。新規時は []）。part_id は parts_inventory に存在する想定。
  initialIndirectMaterials?: { part_id: string; quantity: number }[];
  submitLabel: string;
  cancelHref: string;
};

// 間接材料のフォーム内表現。
type IndirectRow = {
  part_id: string;
  quantity: string; // input value（数字に変換するのは送信時）
};

const inputClass = "wos-input";
const labelClass = "wos-label";

// カテゴリ名から推奨される税区分を返す。
//   「車検法定費用」 → shaken_non_tax
//   それ以外        → taxable
function defaultTaxCategoryFor(name: string | undefined): TaxCategory {
  return name === "車検法定費用" ? "shaken_non_tax" : "taxable";
}

// メニュー単機能化 段1 (2026-06-10):
//   「1メニュー＝1金額の項目」に簡略化したフォーム。
//   - 売値1欄 (default_unit_price)
//   - 原価1欄 (labor_cost_price を再利用)
//   - 業販掛け率1欄 + 業販価格1欄 (双方向連動、保存は markup_rate（小数）のみ)
//   - 数量1欄 (default_quantity)
//   旧「工賃 / 部品代の二重構造」「部品リンク (linked_part_id) のマスター/手入力切替」は退役。
//   後方互換のため、保存側で default_labor_cost = default_unit_price、default_parts_cost = 0、
//   parts_cost_price = 0、linked_part_id = null をセットする (actions.ts 側で実施)。
export default function WorkMenuForm({
  action,
  initial,
  allCategories,
  allParts,
  initialIndirectMaterials = [],
  submitLabel,
  cancelHref,
}: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    undefined,
  );

  // 初期カテゴリ: initial の item_category_id があればそれ、無ければ先頭の active。
  const initialCategoryId =
    initial?.item_category_id ?? allCategories[0]?.id ?? "";
  const [categoryId, setCategoryId] = useState<string>(initialCategoryId);

  const selectedCategory = useMemo(
    () => allCategories.find((c) => c.id === categoryId) ?? null,
    [allCategories, categoryId],
  );

  // 初期税区分: initial があればそれ、無ければカテゴリ名から推奨を採用。
  const [taxCategory, setTaxCategory] = useState<TaxCategory>(
    initial?.tax_category ?? defaultTaxCategoryFor(selectedCategory?.name),
  );

  function handleCategoryChange(id: string) {
    setCategoryId(id);
    const next = allCategories.find((c) => c.id === id) ?? null;
    setTaxCategory(defaultTaxCategoryFor(next?.name));
  }

  // 売値の初期値: 既存メニューでは default_unit_price > 0 ならそれを採用。
  // それが 0 のときは (旧二重構造の) default_labor_cost+default_parts_cost を合算して救済する
  // → これで「工賃のみメニュー」「両方ありメニュー」「単価のみメニュー」のいずれを開いても
  //    売値1欄に妥当な値が入る。新規は空 (placeholder="—")。
  const initialAmount = (() => {
    const u = initial?.default_unit_price ?? 0;
    if (u > 0) return u;
    const fromLegacy =
      (initial?.default_labor_cost ?? 0) + (initial?.default_parts_cost ?? 0);
    return fromLegacy > 0 ? fromLegacy : null;
  })();

  // 原価の初期値: labor_cost_price をそのままメニューの原価として再利用する。
  // 旧 parts_cost_price は 0 で埋まっている前提のため合算は行わない (今回は単純化)。
  const [amount, setAmount] = useState<string>(moneyDefault(initialAmount));
  const [costPrice, setCostPrice] = useState<string>(
    moneyDefault(initial?.labor_cost_price),
  );

  // 業販掛け率 / 業販価格の双方向連動 (PriceMarkupGroup と同じパターン)。
  // 保存されるのは markup_rate (小数)。業販価格は表示計算のみ。
  // 段1で markup_rate の意味は「メニュー売値全体の掛け率」に統一 (第二歩-1の工賃用から拡張)。
  const initialMarkupPct =
    initial?.markup_rate != null && Number.isFinite(initial.markup_rate)
      ? String(Math.round(initial.markup_rate * 1000) / 10)
      : "";
  const initialBulkPrice =
    initialAmount != null &&
    initial?.markup_rate != null &&
    Number.isFinite(initialAmount * initial.markup_rate)
      ? String(Math.round(initialAmount * initial.markup_rate))
      : "";
  const [markupPct, setMarkupPct] = useState<string>(initialMarkupPct);
  const [bulkPrice, setBulkPrice] = useState<string>(initialBulkPrice);

  function recalcBulkFromRate(amt: string, pct: string): string {
    const a = Number(amt);
    const p = Number(pct);
    if (amt.trim() === "" || !Number.isFinite(a)) return "";
    if (pct.trim() === "" || !Number.isFinite(p)) return "";
    const b = a * (p / 100);
    return Number.isFinite(b) ? String(Math.round(b)) : "";
  }
  function recalcRateFromBulk(amt: string, bp: string): string {
    const a = Number(amt);
    const b = Number(bp);
    if (!Number.isFinite(a) || a <= 0) return "";
    if (bp.trim() === "" || !Number.isFinite(b)) return "";
    const pct = (b / a) * 100;
    return Number.isFinite(pct) ? String(Math.round(pct * 10) / 10) : "";
  }

  function onAmountChange(v: string) {
    setAmount(v);
    if (markupPct !== "") {
      setBulkPrice(recalcBulkFromRate(v, markupPct));
    } else if (bulkPrice !== "") {
      setMarkupPct(recalcRateFromBulk(v, bulkPrice));
    }
  }
  function onMarkupPctChange(v: string) {
    setMarkupPct(v);
    setBulkPrice(recalcBulkFromRate(amount, v));
  }
  function onBulkPriceChange(v: string) {
    setBulkPrice(v);
    setMarkupPct(recalcRateFromBulk(amount, v));
  }

  // hidden で送る markup_rate は小数。空 → サーバー pickNullableNumber で null。
  const markupRateHiddenValue = (() => {
    if (markupPct.trim() === "") return "";
    const n = Number(markupPct);
    if (!Number.isFinite(n)) return "";
    return String(n / 100);
  })();
  const amountEmpty = amount.trim() === "" || !(Number(amount) > 0);

  // ============ 間接材料 (Step 5 から継続・在庫の確保/消費に必須) ============
  const [indirectRows, setIndirectRows] = useState<IndirectRow[]>(() =>
    initialIndirectMaterials.map((m) => ({
      part_id: m.part_id,
      quantity: String(m.quantity),
    })),
  );
  const [addPartId, setAddPartId] = useState<string>("");

  const selectablePartsForIndirect = useMemo(() => {
    const taken = new Set(indirectRows.map((r) => r.part_id));
    return allParts.filter((p) => !taken.has(p.id));
  }, [allParts, indirectRows]);

  function addIndirect() {
    if (!addPartId) return;
    setIndirectRows((prev) => [...prev, { part_id: addPartId, quantity: "1" }]);
    setAddPartId("");
  }

  function removeIndirect(partId: string) {
    setIndirectRows((prev) => prev.filter((r) => r.part_id !== partId));
  }

  function updateIndirectQty(partId: string, qty: string) {
    setIndirectRows((prev) =>
      prev.map((r) => (r.part_id === partId ? { ...r, quantity: qty } : r)),
    );
  }

  const indirectMaterialsJson = useMemo(
    () =>
      JSON.stringify(
        indirectRows
          .map((r) => ({
            part_id: r.part_id,
            quantity: Number(r.quantity) || 0,
          }))
          .filter((e) => e.quantity > 0),
      ),
    [indirectRows],
  );

  const partsById = useMemo(() => {
    const m = new Map<string, PartsInventory>();
    for (const p of allParts) m.set(p.id, p);
    return m;
  }, [allParts]);

  return (
    <form action={formAction} className="wos-card space-y-5">
      <div>
        <label htmlFor="work_name" className={labelClass}>
          項目名 <span className="text-red-600">*</span>
        </label>
        <input
          id="work_name"
          name="work_name"
          required
          defaultValue={initial?.work_name ?? ""}
          className={inputClass}
          placeholder="例: エンジンオイル交換 / 技術料 / 廃油処理費"
        />
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          部品以外の費目を登録します（工賃・技術料・送料など）。部品は「部品在庫」から登録してください。
        </p>
      </div>

      <div>
        <label htmlFor="item_category_id" className={labelClass}>
          業務カテゴリ <span className="text-red-600">*</span>
        </label>
        <select
          id="item_category_id"
          name="item_category_id"
          required
          value={categoryId}
          onChange={(e) => handleCategoryChange(e.target.value)}
          className={inputClass}
        >
          {allCategories.length === 0 && (
            <option value="">（カテゴリ未登録）</option>
          )}
          {allCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.is_system ? "（標準）" : ""}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          カテゴリは「カテゴリ管理」画面で追加・編集できます。
        </p>
      </div>

      <div>
        <span className={labelClass}>
          税区分 <span className="text-red-600">*</span>
        </span>
        <div className="flex flex-wrap gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950">
            <input
              type="radio"
              name="tax_category"
              value="taxable"
              checked={taxCategory === "taxable"}
              onChange={() => setTaxCategory("taxable")}
            />
            <span>課税</span>
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950">
            <input
              type="radio"
              name="tax_category"
              value="shaken_non_tax"
              checked={taxCategory === "shaken_non_tax"}
              onChange={() => setTaxCategory("shaken_non_tax")}
            />
            <span>車検非課税</span>
          </label>
        </div>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          通常は変更不要です。自賠責保険・重量税・印紙代など消費税の対象外を選ぶ場合のみ「車検非課税」にしてください。
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="default_quantity" className={labelClass}>
            数量デフォルト
          </label>
          <input
            id="default_quantity"
            name="default_quantity"
            type="number"
            inputMode="decimal"
            min={0}
            step={1}
            defaultValue={initial?.default_quantity ?? 1}
            className={`${inputClass} text-right`}
          />
        </div>
        <div>
          <label htmlFor="default_unit_price" className={labelClass}>
            金額（売値）
          </label>
          <input
            id="default_unit_price"
            name="default_unit_price"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
            placeholder="—"
            className={`${inputClass} text-right`}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>業販掛け率(%)</label>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={1}
            value={markupPct}
            onChange={(e) => onMarkupPctChange(e.target.value)}
            placeholder="例: 80"
            className={`${inputClass} text-right`}
          />
        </div>
        <div>
          <label className={labelClass}>業販価格</label>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={amountEmpty ? "" : bulkPrice}
            onChange={(e) => onBulkPriceChange(e.target.value)}
            disabled={amountEmpty}
            placeholder={amountEmpty ? "金額未設定" : "例: 16000"}
            className={`${inputClass} text-right ${
              amountEmpty ? "cursor-not-allowed opacity-60" : ""
            }`}
          />
        </div>
      </div>
      <input type="hidden" name="markup_rate" value={markupRateHiddenValue} />
      <p className="-mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        業販掛け率は、法人顧客で受注したとき「金額 × 掛け率」を業販価格として明細に入れます。
        個人顧客には影響しません。
      </p>

      <div>
        <label htmlFor="labor_cost_price" className={labelClass}>
          原価 <span className="text-xs text-zinc-500">（社内管理用）</span>
        </label>
        <input
          id="labor_cost_price"
          name="labor_cost_price"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={costPrice}
          onChange={(e) => setCostPrice(e.target.value)}
          placeholder="—"
          className={`${inputClass} text-right`}
        />
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          原価は粗利計算用です。見積書・請求書には表示されません。
        </p>
      </div>

      {/* 標準間接材料セクション（Step 5）。明細に出さず、在庫減算と粗利計算にだけ使う。 */}
      <div className="rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            標準間接材料 <span className="text-xs text-zinc-500">（任意・複数可）</span>
          </span>
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
            社内管理用
          </span>
        </div>
        <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
          明細に出さずに付随して使う部品（Oリング・グリス等）です。受注確定で在庫が
          <span className="px-0.5 font-mono">標準使用量 × 明細数量</span>
          減ります。見積書・請求書には表示されません。
        </p>

        {indirectRows.length > 0 && (
          <ul className="mb-3 divide-y divide-zinc-200 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {indirectRows.map((r) => {
              const p = partsById.get(r.part_id);
              return (
                <li
                  key={r.part_id}
                  className="flex items-center gap-3 px-3 py-2 text-sm"
                >
                  <span className="flex-1 text-zinc-900 dark:text-zinc-50">
                    {p?.name ?? "（不明な部品）"}
                    {p?.show_in_detail === false && (
                      <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 text-[10px] text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                        間接材料
                      </span>
                    )}
                    {p?.deleted_at != null && (
                      <span className="ml-1.5 rounded bg-zinc-200 px-1 py-0.5 text-[10px] text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300">
                        非表示
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                    ×
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={1}
                    value={r.quantity}
                    onChange={(e) =>
                      updateIndirectQty(r.part_id, e.target.value)
                    }
                    aria-label="標準使用量"
                    className="w-20 rounded-md border border-zinc-300 bg-white px-2 py-1 text-right text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
                  />
                  {p?.unit && (
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {p.unit}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeIndirect(r.part_id)}
                    className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-red-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-red-400"
                  >
                    削除
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {allParts.length === 0 ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            部品マスターが未登録です。
            <Link
              href="/dashboard/parts-inventory/new"
              className="ml-1 underline-offset-2 hover:underline"
            >
              部品在庫から登録
            </Link>
            してください。
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={addPartId}
              onChange={(e) => setAddPartId(e.target.value)}
              className={`${inputClass} max-w-md`}
            >
              <option value="">（部品を選択）</option>
              {selectablePartsForIndirect.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.show_in_detail === false ? "（間接材料）" : ""}
                  {p.unit ? ` [${p.unit}]` : ""}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={addIndirect}
              disabled={!addPartId}
              className="rounded-md border border-dashed border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 transition-colors hover:border-zinc-500 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:bg-zinc-800"
            >
              ＋ 間接材料を追加
            </button>
          </div>
        )}

        <input
          type="hidden"
          name="indirect_materials_json"
          value={indirectMaterialsJson}
        />
      </div>

      <div>
        <label htmlFor="memo" className={labelClass}>
          メモ <span className="text-xs text-zinc-500">（任意）</span>
        </label>
        <textarea
          id="memo"
          name="memo"
          rows={3}
          defaultValue={initial?.memo ?? ""}
          className={inputClass}
        />
      </div>

      {state?.error && (
        <p role="alert" className="wos-alert warn">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending || allCategories.length === 0}
          className="wos-btn wos-btn-sm"
        >
          {pending ? "保存中…" : submitLabel}
        </button>
        <Link href={cancelHref} className="wos-btn-ghost wos-btn-sm">
          キャンセル
        </Link>
      </div>
    </form>
  );
}
