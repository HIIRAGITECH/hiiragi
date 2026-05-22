"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { PartsInventory } from "@/lib/types";
import type { FormState } from "./actions";

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  initial?: PartsInventory;
  submitLabel: string;
  cancelHref: string;
};

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-50 dark:focus:ring-zinc-50";

const labelClass =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";

export default function PartForm({
  action,
  initial,
  submitLabel,
  cancelHref,
}: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    undefined,
  );

  const isEdit = !!initial;

  // 「明細に出す」チェック状態。OFF のとき間接材料の説明を出す。
  const [showInDetail, setShowInDetail] = useState<boolean>(
    initial?.show_in_detail ?? true,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="name" className={labelClass}>
          部品名 <span className="text-red-600">*</span>
        </label>
        <input
          id="name"
          name="name"
          required
          defaultValue={initial?.name ?? ""}
          className={inputClass}
          placeholder="例: Hirokoオイル 4L"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="cost_price" className={labelClass}>
            原価（仕入値） <span className="text-red-600">*</span>
          </label>
          <input
            id="cost_price"
            name="cost_price"
            type="number"
            min={0}
            step={1}
            required
            defaultValue={initial?.cost_price ?? 0}
            className={`${inputClass} text-right`}
          />
        </div>
        <div>
          <label htmlFor="sale_price" className={labelClass}>
            売価 <span className="text-xs text-zinc-500">（任意）</span>
          </label>
          <input
            id="sale_price"
            name="sale_price"
            type="number"
            min={0}
            step={1}
            defaultValue={initial?.sale_price ?? ""}
            className={`${inputClass} text-right`}
            placeholder="明細に出さない部品は空でOK"
          />
        </div>
      </div>

      <div className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="show_in_detail"
            checked={showInDetail}
            onChange={(e) => setShowInDetail(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium text-zinc-900 dark:text-zinc-50">
              明細に出す
            </span>
            <span className="mt-0.5 block text-xs text-zinc-600 dark:text-zinc-400">
              ON: 通常の部品として受注明細に表示する。
            </span>
          </span>
        </label>
        {!showInDetail && (
          <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            間接材料（Oリング・グリス等）として扱います。明細には出さず、工賃に含まれる扱いになります。在庫管理と粗利計算には使用されます。
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* 在庫数: 新規時のみ入力可。編集時は表示のみ（入庫/棚卸で変更する導線）。 */}
        {isEdit ? (
          <div>
            <span className={labelClass}>現在の在庫数</span>
            <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-right text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              {initial?.stock_quantity ?? 0}
              {initial?.unit ? ` ${initial.unit}` : ""}
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              在庫数は一覧の「入庫」「棚卸」から変更してください。
            </p>
          </div>
        ) : (
          <div>
            <label htmlFor="initial_stock_quantity" className={labelClass}>
              初期在庫数
            </label>
            <input
              id="initial_stock_quantity"
              name="initial_stock_quantity"
              type="number"
              min={0}
              step="0.1"
              defaultValue={0}
              className={`${inputClass} text-right`}
            />
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              登録時の在庫数。0 より大きい場合は入庫履歴として記録されます。
            </p>
          </div>
        )}

        <div>
          <label htmlFor="reorder_point" className={labelClass}>
            発注点
          </label>
          <input
            id="reorder_point"
            name="reorder_point"
            type="number"
            min={0}
            step="0.1"
            defaultValue={initial?.reorder_point ?? 0}
            className={`${inputClass} text-right`}
          />
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            在庫がこの数を下回ったら一覧で🔴発注バッジが付きます。
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="supplier" className={labelClass}>
            仕入先 <span className="text-xs text-zinc-500">（任意）</span>
          </label>
          <input
            id="supplier"
            name="supplier"
            defaultValue={initial?.supplier ?? ""}
            className={inputClass}
            placeholder="例: ○○商会"
          />
        </div>
        <div>
          <label htmlFor="unit" className={labelClass}>
            単位 <span className="text-xs text-zinc-500">（任意）</span>
          </label>
          <input
            id="unit"
            name="unit"
            defaultValue={initial?.unit ?? ""}
            className={inputClass}
            placeholder="例: 個 / 本 / L"
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
          disabled={pending}
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
