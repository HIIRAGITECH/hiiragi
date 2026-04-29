"use client";

import { useActionState } from "react";
import type { ShopInfo } from "@/lib/types";
import { updateShopInfo, type SettingsFormState } from "./actions";
import ImageUpload from "./image-upload";

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-50 dark:focus:ring-zinc-50";

const labelClass =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";

export default function SettingsForm({
  initial,
  userId,
}: {
  initial: ShopInfo;
  userId: string;
}) {
  const [state, formAction, pending] = useActionState<
    SettingsFormState,
    FormData
  >(updateShopInfo, undefined);

  const success = state && "success" in state && state.success;
  const error = state && "error" in state ? state.error : undefined;

  return (
    <div className="space-y-8">
      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="shop_name" className={labelClass}>
            店舗名 <span className="text-red-600">*</span>
          </label>
          <input
            id="shop_name"
            name="shop_name"
            required
            defaultValue={initial.shop_name}
            placeholder="例: ヒイラギ自動車整備工場"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="address" className={labelClass}>
            住所
          </label>
          <input
            id="address"
            name="address"
            defaultValue={initial.address}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="phone" className={labelClass}>
            電話番号
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={initial.phone}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="registration_no" className={labelClass}>
            インボイス登録番号
          </label>
          <input
            id="registration_no"
            name="registration_no"
            defaultValue={initial.registration_no}
            placeholder="T1234567890123"
            className={inputClass}
          />
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
          >
            {error}
          </p>
        )}
        {success && (
          <p
            role="status"
            className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
          >
            保存しました。
          </p>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {pending ? "保存中..." : "保存する"}
          </button>
        </div>
      </form>

      <div className="space-y-6 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <ImageUpload
          userId={userId}
          kind="logo"
          currentPath={initial.logo_path}
          label="店舗ロゴ"
          helpText="PNG / JPEG / WebP（2MB以内）。見積書・請求書のヘッダ左上に表示されます。長辺 600px 前後を推奨。"
          maxSizeMB={2}
        />
        <ImageUpload
          userId={userId}
          kind="stamp"
          currentPath={initial.stamp_path}
          label="電子印鑑（角印）"
          helpText="背景透過PNGをアップロードしてください（1MB以内）。会社名に重ねて表示されます。300×300px 前後を推奨。"
          requireTransparent
          maxSizeMB={1}
        />
      </div>
    </div>
  );
}
