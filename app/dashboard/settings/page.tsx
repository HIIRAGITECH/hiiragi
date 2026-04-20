import type { Metadata } from "next";
import { getShopInfo } from "@/lib/shop";
import SettingsForm from "./settings-form";

export const metadata: Metadata = {
  title: "店舗設定 | HIIRAGI",
};

export default async function SettingsPage() {
  const shop = await getShopInfo();

  return (
    <>
      <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        店舗設定
      </h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        ここで設定した店舗情報は、見積書・請求書のヘッダに表示されます。
      </p>

      <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <SettingsForm initial={shop} />
      </div>
    </>
  );
}
