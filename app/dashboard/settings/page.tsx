import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getShopInfo } from "@/lib/shop";
import SettingsForm from "./settings-form";

export const metadata: Metadata = {
  title: "店舗設定 | HIIRAGI",
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const shop = await getShopInfo();

  return (
    <>
      <div className="wos-pagehead">
        <div className="min-w-0 flex-1">
          <div className="wos-crumbs">システム ／ 設定</div>
          <h1>店舗設定</h1>
          <div className="wos-gloss">
            ここで設定した店舗情報は、見積書・請求書のヘッダに表示されます。
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[var(--color-cream)]">
        <div className="px-8 py-6 max-w-4xl">
          <SettingsForm initial={shop} userId={user!.id} />
        </div>
      </div>
    </>
  );
}
