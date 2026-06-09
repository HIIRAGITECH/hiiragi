"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { formatYen } from "@/lib/format";
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
  // 部品マスター（deleted_at IS NULL のアクティブ行のみ、display_order 順）。
  // initial.linked_part_id が非アクティブを指すケースもあり、その時は親で合流させて渡す。
  allParts: PartsInventory[];
  // 初期の間接材料リスト（編集時のみ。新規時は []）。
  // part_id は parts_inventory に存在する想定。
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
const readonlyClass =
  "w-full border border-[var(--color-line)] bg-[var(--color-cream)] px-3 py-2 text-sm text-[var(--color-ink-soft)]";
const labelClass = "wos-label";

// カテゴリ名から推奨される税区分を返す。
//   「車検法定費用」 → shaken_non_tax
//   それ以外        → taxable
function defaultTaxCategoryFor(name: string | undefined): TaxCategory {
  return name === "車検法定費用" ? "shaken_non_tax" : "taxable";
}

type PartsMode = "master" | "manual";

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
    // カテゴリ変更時、税区分を推奨値で上書き（ユーザーが直前に手動で変えていた場合は
    // 上書きされるが、UX として「カテゴリ＝税区分の組」を更新する挙動の方が直感的）。
    const next = allCategories.find((c) => c.id === id) ?? null;
    setTaxCategory(defaultTaxCategoryFor(next?.name));
  }

  // 部品モード: 編集時 initial.linked_part_id があれば 'master'、それ以外は 'manual'（新規も含む）。
  const [partsMode, setPartsMode] = useState<PartsMode>(
    initial?.linked_part_id ? "master" : "manual",
  );

  // マスターから選んだ部品 id（master モード時のみ意味あり）。
  const [linkedPartId, setLinkedPartId] = useState<string>(
    initial?.linked_part_id ?? "",
  );

  // 手入力モード時の部品名・部品代・部品代原価。
  // master モードに切り替えても入力中の値は捨てない（戻したときに復元できる）。
  const [manualPartName, setManualPartName] = useState<string>(
    initial?.part_name ?? "",
  );
  // 0 / 未入力は空表示（placeholder="—"）。正の値のみ初期表示する。
  const [manualPartsCost, setManualPartsCost] = useState<string>(
    moneyDefault(initial?.default_parts_cost),
  );
  const [manualPartsCostPrice, setManualPartsCostPrice] = useState<string>(
    moneyDefault(initial?.parts_cost_price),
  );

  // 業販対応 第二歩-1 (2026-06-09): 工賃側の業販掛け率 / 業販工賃 を双方向に連動させる。
  //   工賃 (default_labor_cost) も同じ state 群に取り込んで controlled 化し、変更時に追従させる。
  //   保存されるのは markup_rate（小数）と default_labor_cost のみ。業販工賃は表示計算のみ。
  const [laborCost, setLaborCost] = useState<string>(
    moneyDefault(initial?.default_labor_cost),
  );
  const initialLaborMarkupPct =
    initial?.markup_rate != null && Number.isFinite(initial.markup_rate)
      ? String(Math.round(initial.markup_rate * 1000) / 10)
      : "";
  const initialBulkLabor =
    initial?.default_labor_cost != null &&
    initial?.markup_rate != null &&
    Number.isFinite(initial.default_labor_cost * initial.markup_rate)
      ? String(Math.round(initial.default_labor_cost * initial.markup_rate))
      : "";
  const [laborMarkupPct, setLaborMarkupPct] =
    useState<string>(initialLaborMarkupPct);
  const [bulkLabor, setBulkLabor] = useState<string>(initialBulkLabor);

  function recalcBulkLaborFromRate(lc: string, pct: string): string {
    const lcN = Number(lc);
    const pctN = Number(pct);
    if (lc.trim() === "" || !Number.isFinite(lcN)) return "";
    if (pct.trim() === "" || !Number.isFinite(pctN)) return "";
    const b = lcN * (pctN / 100);
    return Number.isFinite(b) ? String(Math.round(b)) : "";
  }
  function recalcRateFromBulkLabor(lc: string, bp: string): string {
    const lcN = Number(lc);
    const bpN = Number(bp);
    if (!Number.isFinite(lcN) || lcN <= 0) return "";
    if (bp.trim() === "" || !Number.isFinite(bpN)) return "";
    const pct = (bpN / lcN) * 100;
    return Number.isFinite(pct) ? String(Math.round(pct * 10) / 10) : "";
  }

  function onLaborCostChange(v: string) {
    setLaborCost(v);
    if (laborMarkupPct !== "") {
      setBulkLabor(recalcBulkLaborFromRate(v, laborMarkupPct));
    } else if (bulkLabor !== "") {
      setLaborMarkupPct(recalcRateFromBulkLabor(v, bulkLabor));
    }
  }
  function onLaborMarkupPctChange(v: string) {
    setLaborMarkupPct(v);
    setBulkLabor(recalcBulkLaborFromRate(laborCost, v));
  }
  function onBulkLaborChange(v: string) {
    setBulkLabor(v);
    setLaborMarkupPct(recalcRateFromBulkLabor(laborCost, v));
  }

  // hidden で送る markup_rate は小数。空 → サーバー pickNullableNumber で null。
  const laborMarkupHiddenValue = (() => {
    if (laborMarkupPct.trim() === "") return "";
    const n = Number(laborMarkupPct);
    if (!Number.isFinite(n)) return "";
    return String(n / 100);
  })();
  const laborEmpty = laborCost.trim() === "" || !(Number(laborCost) > 0);

  const selectedPart = useMemo(
    () => allParts.find((p) => p.id === linkedPartId) ?? null,
    [allParts, linkedPartId],
  );

  // master モード用の表示値（読み取り専用）。選択前は空表示。
  // sale_price が null の部品（間接材料）はリンク不可。UI 側で選択肢から除外する。
  const masterPartName = selectedPart?.name ?? "";
  const masterPartsCost = selectedPart?.sale_price ?? 0;
  const masterPartsCostPrice = selectedPart?.cost_price ?? 0;

  // master モードで「明細に出す」=false の部品が選ばれた場合の警告（間接材料は明細に乗らない）。
  // Step 3 では選択肢から除外する方針。ここではガード表示のみ。
  const selectedPartIsIndirect =
    selectedPart !== null && selectedPart.show_in_detail === false;

  // 間接材料: メニューの標準使用量。送信時は JSON 文字列にして 1 個の hidden input にまとめる。
  const [indirectRows, setIndirectRows] = useState<IndirectRow[]>(() =>
    initialIndirectMaterials.map((m) => ({
      part_id: m.part_id,
      quantity: String(m.quantity),
    })),
  );
  // 追加用ドロップダウンの選択値。
  const [addPartId, setAddPartId] = useState<string>("");

  // 既に追加済みの part_id は二重登録を避けて選択肢から除外する。
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

  // 送信用 JSON。サーバー側でパース・検証する。
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

  // 表示用: part_id → 部品行 のマップ。
  const partsById = useMemo(() => {
    const m = new Map<string, PartsInventory>();
    for (const p of allParts) m.set(p.id, p);
    return m;
  }, [allParts]);

  return (
    <form action={formAction} className="wos-card space-y-5">
      <div>
        <label htmlFor="work_name" className={labelClass}>
          作業内容 <span className="text-red-600">*</span>
        </label>
        <input
          id="work_name"
          name="work_name"
          required
          defaultValue={initial?.work_name ?? ""}
          className={inputClass}
          placeholder="例: エンジンオイル交換"
        />
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

      {/* 部品セクション: マスターから選ぶ / 手入力 の切り替え。
          いずれのモードでも最終的に name="part_name" / "default_parts_cost" /
          "parts_cost_price" / "linked_part_id" を formData に乗せて送信する。 */}
      <div className="rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            部品 <span className="text-xs text-zinc-500">（任意）</span>
          </span>
          <label className="flex cursor-pointer items-center gap-1.5 text-sm">
            <input
              type="radio"
              name="parts_mode"
              checked={partsMode === "master"}
              onChange={() => setPartsMode("master")}
            />
            <span>マスターから選ぶ</span>
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-sm">
            <input
              type="radio"
              name="parts_mode"
              checked={partsMode === "manual"}
              onChange={() => setPartsMode("manual")}
            />
            <span>手入力</span>
          </label>
        </div>

        {partsMode === "master" ? (
          <div className="space-y-3">
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
              <div>
                <label htmlFor="linked_part_select" className={labelClass}>
                  部品マスターを選択
                </label>
                <select
                  id="linked_part_select"
                  value={linkedPartId}
                  onChange={(e) => setLinkedPartId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">（未選択）</option>
                  {allParts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.show_in_detail === false ? "（間接材料）" : ""}
                      {p.sale_price != null
                        ? ` — 売価 ${formatYen(p.sale_price)}`
                        : " — 売価なし"}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  選択した部品の名前・売価・原価が自動で入ります。マスターを変更すると次回の編集時に反映されます。
                </p>
                {selectedPartIsIndirect && (
                  <p className="mt-2 rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                    この部品は「間接材料」設定です。明細にはこのメニュー経由で表示されますが、運用上は工賃メニューへの紐付けを推奨します。
                  </p>
                )}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <span className={labelClass}>部品名</span>
                <div className={readonlyClass}>{masterPartName || "—"}</div>
              </div>
              <div>
                <span className={labelClass}>部品代（売価）</span>
                <div className={`${readonlyClass} text-right`}>
                  {selectedPart ? formatYen(masterPartsCost) : "—"}
                </div>
              </div>
              <div className="sm:col-span-2">
                <span className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">
                  部品代 原価 <span className="text-[10px]">（社内管理用）</span>
                </span>
                <div className={`${readonlyClass} text-right`}>
                  {selectedPart ? formatYen(masterPartsCostPrice) : "—"}
                </div>
              </div>
            </div>

            {/* 送信用の hidden フィールド。
                未選択 (linkedPartId === "") の場合は空送信される。
                サーバー側でその場合は手入力扱い（linked_part_id=null, 部品名/値は空/0）にする。 */}
            <input type="hidden" name="linked_part_id" value={linkedPartId} />
            <input
              type="hidden"
              name="part_name"
              value={selectedPart ? masterPartName : ""}
            />
            <input
              type="hidden"
              name="default_parts_cost"
              value={selectedPart ? masterPartsCost : 0}
            />
            <input
              type="hidden"
              name="parts_cost_price"
              value={selectedPart ? masterPartsCostPrice : 0}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label htmlFor="part_name" className={labelClass}>
                部品名
              </label>
              <input
                id="part_name"
                name="part_name"
                value={manualPartName}
                onChange={(e) => setManualPartName(e.target.value)}
                className={inputClass}
                placeholder="例: モチュール 300V 5W-40 4L"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="default_parts_cost" className={labelClass}>
                  部品代デフォルト
                </label>
                <input
                  id="default_parts_cost"
                  name="default_parts_cost"
                  type="number"
                  min={0}
                  step={1}
                  value={manualPartsCost}
                  onChange={(e) => setManualPartsCost(e.target.value)}
                  placeholder="—"
                  className={`${inputClass} text-right`}
                />
              </div>
              <div>
                <label
                  htmlFor="parts_cost_price"
                  className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400"
                >
                  部品代 原価 <span className="text-[10px]">（社内管理用）</span>
                </label>
                <input
                  id="parts_cost_price"
                  name="parts_cost_price"
                  type="number"
                  min={0}
                  step={1}
                  value={manualPartsCostPrice}
                  onChange={(e) => setManualPartsCostPrice(e.target.value)}
                  placeholder="—"
                  className={`${inputClass} text-right`}
                />
              </div>
            </div>
            {/* 手入力モードでは linked_part_id を空にして送信 */}
            <input type="hidden" name="linked_part_id" value="" />
          </div>
        )}
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
            単価デフォルト
          </label>
          <input
            id="default_unit_price"
            name="default_unit_price"
            type="number"
            min={0}
            step={1}
            defaultValue={moneyDefault(initial?.default_unit_price)}
            placeholder="—"
            className={`${inputClass} text-right`}
          />
        </div>
        <div>
          <label htmlFor="default_labor_cost" className={labelClass}>
            工賃デフォルト
          </label>
          <input
            id="default_labor_cost"
            name="default_labor_cost"
            type="number"
            min={0}
            step={1}
            value={laborCost}
            onChange={(e) => onLaborCostChange(e.target.value)}
            placeholder="—"
            className={`${inputClass} text-right`}
          />
          {/* 業販対応: 工賃側の掛け率(%)と業販工賃を双方向連動で入力する */}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">
                業販掛け率(%)
              </label>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={1}
                value={laborMarkupPct}
                onChange={(e) => onLaborMarkupPctChange(e.target.value)}
                placeholder="例: 80"
                className={`${inputClass} text-right`}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">
                業販工賃
              </label>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={laborEmpty ? "" : bulkLabor}
                onChange={(e) => onBulkLaborChange(e.target.value)}
                disabled={laborEmpty}
                placeholder={laborEmpty ? "工賃未設定" : "例: 16000"}
                className={`${inputClass} text-right ${
                  laborEmpty ? "cursor-not-allowed opacity-60" : ""
                }`}
              />
            </div>
          </div>
          <input type="hidden" name="markup_rate" value={laborMarkupHiddenValue} />
          <label
            htmlFor="labor_cost_price"
            className="mt-2 mb-1 block text-xs text-zinc-500 dark:text-zinc-400"
          >
            工賃 原価 <span className="text-[10px]">（社内管理用）</span>
          </label>
          <input
            id="labor_cost_price"
            name="labor_cost_price"
            type="number"
            min={0}
            step={1}
            defaultValue={moneyDefault(initial?.labor_cost_price)}
            placeholder="—"
            className={`${inputClass} text-right`}
          />
        </div>
      </div>
      <p className="-mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        原価は粗利計算用です。見積書・請求書には表示されません。
      </p>

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
          明細に出さず工賃に含む部品（Oリング・グリス等）です。受注確定で在庫が
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
