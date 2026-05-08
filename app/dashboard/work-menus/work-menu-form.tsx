"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import type {
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
  submitLabel: string;
  cancelHref: string;
};

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-50 dark:focus:ring-zinc-50";

const labelClass =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";

// カテゴリ名から推奨される税区分を返す。
//   「車検法定費用」 → shaken_non_tax
//   それ以外        → taxable
function defaultTaxCategoryFor(name: string | undefined): TaxCategory {
  return name === "車検法定費用" ? "shaken_non_tax" : "taxable";
}

export default function WorkMenuForm({
  action,
  initial,
  allCategories,
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

  return (
    <form action={formAction} className="space-y-4">
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
        <label htmlFor="part_name" className={labelClass}>
          部品名 <span className="text-xs text-zinc-500">（任意）</span>
        </label>
        <input
          id="part_name"
          name="part_name"
          defaultValue={initial?.part_name ?? ""}
          className={inputClass}
          placeholder="例: モチュール 300V 5W-40 4L"
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

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="default_quantity" className={labelClass}>
            数量デフォルト
          </label>
          <input
            id="default_quantity"
            name="default_quantity"
            type="number"
            min={0}
            step="0.1"
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
            defaultValue={initial?.default_unit_price ?? 0}
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
            defaultValue={initial?.default_labor_cost ?? 0}
            className={`${inputClass} text-right`}
          />
        </div>
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
            defaultValue={initial?.default_parts_cost ?? 0}
            className={`${inputClass} text-right`}
          />
        </div>
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
        <p
          role="alert"
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || allCategories.length === 0}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {pending ? "保存中..." : submitLabel}
        </button>
        <Link
          href={cancelHref}
          className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          キャンセル
        </Link>
      </div>
    </form>
  );
}
