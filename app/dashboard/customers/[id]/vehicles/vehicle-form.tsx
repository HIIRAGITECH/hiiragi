"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { Vehicle } from "@/lib/types";
import type { FormState } from "../../actions";

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  initial?: Vehicle;
  submitLabel: string;
  cancelHref: string;
};

export default function VehicleForm({
  action,
  initial,
  submitLabel,
  cancelHref,
}: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    undefined,
  );

  return (
    <form action={formAction} className="wos-card space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="plate_number" className="wos-label">
            車両ナンバー
          </label>
          <input
            id="plate_number"
            name="plate_number"
            defaultValue={initial?.plate_number ?? ""}
            placeholder="湘南 し 11-04"
            className="wos-input"
          />
        </div>
        <div>
          <label htmlFor="maker" className="wos-label">
            メーカー
          </label>
          <input
            id="maker"
            name="maker"
            defaultValue={initial?.maker ?? ""}
            placeholder="HONDA"
            className="wos-input"
          />
        </div>
        <div>
          <label htmlFor="model" className="wos-label">
            車種
          </label>
          <input
            id="model"
            name="model"
            defaultValue={initial?.model ?? ""}
            placeholder="CBR1000RR-R"
            className="wos-input"
          />
        </div>
        <div>
          <label htmlFor="model_year" className="wos-label">
            年式
          </label>
          <input
            id="model_year"
            name="model_year"
            type="number"
            min={1900}
            max={2100}
            defaultValue={initial?.model_year ?? ""}
            placeholder="2023"
            className="wos-input"
          />
        </div>
        <div>
          <label htmlFor="color" className="wos-label">
            色
          </label>
          <input
            id="color"
            name="color"
            defaultValue={initial?.color ?? ""}
            placeholder="ホワイト"
            className="wos-input"
          />
        </div>
        <div>
          <label htmlFor="vin" className="wos-label">
            車台番号
          </label>
          <input
            id="vin"
            name="vin"
            defaultValue={initial?.vin ?? ""}
            className="wos-input"
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="notes" className="wos-label">
            メモ
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            defaultValue={initial?.notes ?? ""}
            className="wos-textarea"
          />
        </div>
      </div>

      {state?.error && (
        <p role="alert" className="wos-alert warn">
          {state.error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <Link href={cancelHref} className="wos-btn-ghost wos-btn-sm">
          キャンセル
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="wos-btn wos-btn-sm"
        >
          {pending ? "保存中..." : submitLabel}
        </button>
      </div>
    </form>
  );
}
