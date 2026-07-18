import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getShopInfo } from "@/lib/shop";
import DeleteButton from "@/lib/components/delete-button";
import SettingsForm from "./settings-form";
import { disconnectGoogleIntegration } from "./actions";

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

  const {
    google: googleResult,
    reason: googleReason,
    drive: driveResult,
  } = await searchParams;

  // 段階5-A: 連携状態を取得して settings カードを状態別に出し分ける。
  const { data: integrationRow } = await supabase
    .from("google_integrations")
    .select("google_email, root_folder_id, refresh_token")
    .eq("user_id", user!.id)
    .is("deleted_at", null)
    .maybeSingle();
  const integration = integrationRow as {
    google_email: string | null;
    root_folder_id: string | null;
    refresh_token: string | null;
  } | null;
  const googleConnected = !!integration?.refresh_token;
  const googleEmail = integration?.google_email ?? null;
  const rootFolderId = integration?.root_folder_id ?? null;

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
        <div className="px-4 sm:px-8 py-6 max-w-4xl">
          <SettingsForm initial={shop} userId={user!.id} />

          {/* 段階5-A: Googleドライブ連携カード。連携状態で出し分け。 */}
          <div className="mt-8 rounded-lg border border-[var(--color-line)] bg-white p-5">
            <div className="font-medium mb-1">Googleドライブ連携</div>
            <div className="wos-gloss mb-3">
              連携すると、受注詳細から写真フォルダをワンクリックで作成できます。
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

            {googleConnected ? (
              <div className="space-y-3">
                <div className="text-sm text-green-700">
                  ✅ Googleドライブ連携済み
                </div>
                {googleEmail && (
                  <div className="text-sm text-[var(--color-ink-mid)]">
                    <span className="break-all font-medium">{googleEmail}</span>{" "}
                    と連携中
                  </div>
                )}

                {rootFolderId ? (
                  <a
                    href={`https://drive.google.com/drive/folders/${rootFolderId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block rounded-md border border-[var(--color-ink)] px-4 py-2 text-sm text-[var(--color-ink)]"
                  >
                    📂 写真フォルダ（HIIRAGI受注写真）を開く ↗
                  </a>
                ) : (
                  // 親フォルダ未作成（通常は連携時に自動作成済）。フォールバックの作成導線。
                  <div>
                    {driveResult === "error" && (
                      <div className="mb-2 text-sm text-red-700">
                        親フォルダの作成に失敗しました
                        {googleReason ? `（${googleReason}）` : ""}。
                      </div>
                    )}
                    <a
                      href="/api/google/drive/ensure-root"
                      className="inline-block rounded-md border border-[var(--color-ink)] px-4 py-2 text-sm text-[var(--color-ink)]"
                    >
                      📁 親フォルダ（HIIRAGI受注写真）を作成する
                    </a>
                  </div>
                )}

                <div className="border-t border-[var(--color-line)] pt-3">
                  <DeleteButton
                    action={disconnectGoogleIntegration}
                    hidden={{}}
                    confirmMessage="Googleドライブ連携を解除しますか？写真フォルダの自動作成ができなくなります。（Driveに既にあるフォルダや写真は削除されません）"
                    label="連携を解除"
                  />
                  <p className="wos-gloss mt-2">
                    解除しても Drive 上の既存フォルダ・写真は残ります（トークンのみ削除）。
                  </p>
                </div>
              </div>
            ) : (
              <a
                href="/api/google/oauth/start"
                className="inline-block rounded-md bg-[var(--color-ink)] px-4 py-2 text-sm text-white"
              >
                Googleドライブと連携する
              </a>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
