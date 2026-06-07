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

  const [showInDetail, setShowInDetail] = useState<boolean>(
    initial?.show_in_detail ?? true,
  );

  // 原価未入力での保存は、粗利計算が 0 になる影響が大きいので確認ダイアログを挟む。
  // OK なら通常通り form action が走り、server action 側の pickNumber が 0 に正規化する。
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const fd = new FormData(e.currentTarget);
    const costPriceStr = String(fd.get("cost_price") ?? "").trim();
    if (costPriceStr === "") {
      const ok = confirm(
        "原価が空欄ですが、このまま保存してよろしいですか？\n（粗利計算上は 0 として扱われます）",
      );
      if (!ok) {
        e.preventDefault();
      }
    }
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="wos-card space-y-5">
      <div>
        <label htmlFor="name" className="wos-label">
          部品名<span className="wos-req">*</span>
        </label>
        <input
          id="name"
          name="name"
          required
          defaultValue={initial?.name ?? ""}
          className="wos-input"
          placeholder="例: SHOWA フォークオイル SS-19"
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="internal_code" className="wos-label">
            社内品番 <span className="text-xs text-[var(--color-ink-light)]">（任意）</span>
          </label>
          <input
            id="internal_code"
            name="internal_code"
            defaultValue={initial?.internal_code ?? ""}
            className="wos-input"
            placeholder="例: A-001"
          />
        </div>
        <div>
          <label htmlFor="external_code" className="wos-label">
            社外品番 <span className="text-xs text-[var(--color-ink-light)]">（任意）</span>
          </label>
          <input
            id="external_code"
            name="external_code"
            defaultValue={initial?.external_code ?? ""}
            className="wos-input"
            placeholder="例: 90915-YZZD4"
          />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="cost_price" className="wos-label">
            原価（仕入値）
          </label>
          <input
            id="cost_price"
            name="cost_price"
            type="number"
            min={0}
            step={1}
            defaultValue={initial?.cost_price ?? 0}
            placeholder="—"
            className="wos-input text-right"
          />
          <p className="mt-1 text-xs text-[var(--color-ink-light)]">
            空欄でも保存できますが、粗利計算では 0 として扱われます。
          </p>
        </div>
        <div>
          <label htmlFor="sale_price" className="wos-label">
            売価 <span className="text-xs text-[var(--color-ink-light)]">（任意）</span>
          </label>
          <input
            id="sale_price"
            name="sale_price"
            type="number"
            min={0}
            step={1}
            defaultValue={initial?.sale_price ?? ""}
            className="wos-input text-right"
            placeholder="明細に出さない部品は空でOK"
          />
        </div>
      </div>

      <div className="border border-[var(--color-line)] p-3">
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="show_in_detail"
            checked={showInDetail}
            onChange={(e) => setShowInDetail(e.target.checked)}
            className="mt-1"
          />
          <span>
            <span className="font-semibold text-[var(--color-ink)]">
              明細に出す
            </span>
            <span className="mt-0.5 block text-xs text-[var(--color-ink-mid)]">
              ON: 通常の部品として受注明細に表示する。
            </span>
          </span>
        </label>
        {!showInDetail && (
          <p className="wos-alert info mt-2 text-xs">
            間接材料（Oリング・グリス等）として扱います。明細には出さず、工賃に含まれる扱いになります。在庫管理と粗利計算には使用されます。
          </p>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        {isEdit ? (
          <div>
            <span className="wos-label">現在の在庫数</span>
            <div className="bg-[var(--color-cream)] border border-[var(--color-line)] px-3 py-2 text-right text-sm text-[var(--color-ink-soft)]">
              {initial?.stock_quantity ?? 0}
              {initial?.unit ? ` ${initial.unit}` : ""}
            </div>
            <p className="mt-1 text-xs text-[var(--color-ink-light)]">
              在庫数は一覧の「入庫」「棚卸」から変更してください。
            </p>
          </div>
        ) : (
          <div>
            <label htmlFor="initial_stock_quantity" className="wos-label">
              初期在庫数
            </label>
            <input
              id="initial_stock_quantity"
              name="initial_stock_quantity"
              type="number"
              inputMode="decimal"
              min={0}
              step={1}
              defaultValue={0}
              className="wos-input text-right"
            />
            <p className="mt-1 text-xs text-[var(--color-ink-light)]">
              登録時の在庫数。0 より大きい場合は入庫履歴として記録されます。
            </p>
          </div>
        )}

        <div>
          <label htmlFor="reorder_point" className="wos-label">
            発注点
          </label>
          <input
            id="reorder_point"
            name="reorder_point"
            type="number"
            inputMode="decimal"
            min={0}
            step={1}
            defaultValue={initial?.reorder_point ?? 0}
            className="wos-input text-right"
          />
          <p className="mt-1 text-xs text-[var(--color-ink-light)]">
            在庫がこの数を下回ったら一覧で発注バッジが付きます。
          </p>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="supplier" className="wos-label">
            仕入先 <span className="text-xs text-[var(--color-ink-light)]">（任意）</span>
          </label>
          <input
            id="supplier"
            name="supplier"
            defaultValue={initial?.supplier ?? ""}
            className="wos-input"
            placeholder="例: ショウワ商会"
          />
        </div>
        <div>
          <label htmlFor="unit" className="wos-label">
            単位 <span className="text-xs text-[var(--color-ink-light)]">（任意）</span>
          </label>
          <input
            id="unit"
            name="unit"
            defaultValue={initial?.unit ?? ""}
            className="wos-input"
            placeholder="例: 個 / 本 / L"
          />
        </div>
      </div>

      <div>
        <label htmlFor="memo" className="wos-label">
          メモ <span className="text-xs text-[var(--color-ink-light)]">（任意）</span>
        </label>
        <textarea
          id="memo"
          name="memo"
          rows={3}
          defaultValue={initial?.memo ?? ""}
          className="wos-textarea"
        />
      </div>

      {state?.error && (
        <p role="alert" className="wos-alert warn">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={pending} className="wos-btn wos-btn-sm">
          {pending ? "保存中…" : submitLabel}
        </button>
        <Link href={cancelHref} className="wos-btn-ghost wos-btn-sm">
          キャンセル
        </Link>
      </div>
    </form>
  );
}
