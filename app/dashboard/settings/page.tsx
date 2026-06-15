import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getShopInfo } from "@/lib/shop";
import SettingsForm from "./settings-form";

export const metadata: Metadata = {
  title: "店舗設定 | HIIRAGI",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    google?: string;
    reason?: string;
    drive?: string;
    folder_id?: string;
  }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const shop = await getShopInfo();

  // 段階2/3: Googleドライブ連携の動作確認用の最小導線。本設置は段階4。
  const {
    google: googleResult,
    reason: googleReason,
    drive: driveResult,
    folder_id: driveFolderId,
  } = await searchParams;

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

          {/* 段階2: Googleドライブ連携の動作確認用導線（最小）。正式UIは段階4。 */}
          <div className="mt-8 rounded-lg border border-[var(--color-line)] bg-white p-5">
            <div className="font-medium mb-1">Googleドライブ連携（テスト）</div>
            <div className="wos-gloss mb-3">
              連携すると受注の写真フォルダを作成できます（フォルダ機能は段階3以降）。
            </div>
            {googleResult === "success" && (
              <div className="mb-3 text-sm text-green-700">
                連携に成功しました。
              </div>
            )}
            {googleResult === "error" && (
              <div className="mb-3 text-sm text-red-700">
                連携に失敗しました{googleReason ? `（${googleReason}）` : ""}。
              </div>
            )}
            <a
              href="/api/google/oauth/start"
              className="inline-block rounded-md bg-[var(--color-ink)] px-4 py-2 text-sm text-white"
            >
              Googleドライブと連携する
            </a>

            {/* 段階3: 親フォルダ「HIIRAGI受注写真」を確保する動作確認用ボタン。 */}
            <div className="mt-5 border-t border-[var(--color-line)] pt-4">
              {driveResult === "ok" && (
                <div className="mb-3 text-sm text-green-700">
                  親フォルダを確認しました
                  {driveFolderId ? `（folder_id: ${driveFolderId}）` : ""}。
                </div>
              )}
              {driveResult === "error" && (
                <div className="mb-3 text-sm text-red-700">
                  親フォルダの作成に失敗しました
                  {googleReason ? `（${googleReason}）` : ""}。
                </div>
              )}
              <a
                href="/api/google/drive/ensure-root"
                className="inline-block rounded-md border border-[var(--color-ink)] px-4 py-2 text-sm text-[var(--color-ink)]"
              >
                親フォルダを作成／確認する
              </a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
