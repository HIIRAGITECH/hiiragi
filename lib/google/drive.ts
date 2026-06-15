import "server-only";

import { google, type Auth } from "googleapis";
import { createOAuthClient } from "@/lib/google/oauth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// googleapis が内部で使う OAuth2Client 型に揃える (google-auth-library を直接 import すると
// 二重コピーで型が衝突するため、createOAuthClient の戻り型から導出する)。
type OAuthClient = ReturnType<typeof createOAuthClient>;

// Googleドライブ連携 段階3: Drive API を叩くための共有ヘルパー (server-only)。
// 受注ごとの子フォルダ・UI は段階4。ここでは親フォルダ確保まで。

// 連携時に作る親フォルダ名 (DECISIONS 段階0 参照)。
export const ROOT_FOLDER_NAME = "HIIRAGI受注写真";

// 未連携 / refresh_token 失効を呼び出し側で区別できるようにする。
export class GoogleNotConnectedError extends Error {
  constructor(message = "Googleドライブが連携されていません。") {
    super(message);
    this.name = "GoogleNotConnectedError";
  }
}

type AdminClient = ReturnType<typeof createAdminClient>;

// リフレッシュで得た新トークンを保存する。
// refresh_token は再同意時しか返らないため、来た時だけ更新し、null では上書きしない (段階2と同じ注意)。
async function persistRefreshedTokens(
  admin: AdminClient,
  userId: string,
  tokens: Auth.Credentials,
) {
  const update: Record<string, unknown> = {};
  if (tokens.access_token) update.access_token = tokens.access_token;
  if (tokens.expiry_date)
    update.token_expiry = new Date(tokens.expiry_date).toISOString();
  if (tokens.refresh_token) update.refresh_token = tokens.refresh_token;
  if (Object.keys(update).length === 0) return;

  const { error } = await admin
    .from("google_integrations")
    .update(update)
    .eq("user_id", userId);
  if (error) {
    console.error("[google-drive] failed to persist refreshed tokens", {
      message: error.message,
      code: error.code,
    });
  }
}

// 該当ユーザーの refresh_token を service_role で取り出し、自動リフレッシュ設定済みの
// OAuth2 client を返す。access_token 期限切れ時は API 呼び出し時に googleapis が
// refresh_token で自動更新し、"tokens" イベント経由で新トークンを保存する。
export async function getAuthorizedClient(
  userId: string,
): Promise<OAuthClient> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("google_integrations")
    .select("refresh_token, access_token, token_expiry")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("[google-drive] failed to load integration", {
      message: error.message,
      code: error.code,
    });
    throw new Error("Google連携情報の取得に失敗しました。");
  }
  if (!data || !data.refresh_token) {
    throw new GoogleNotConnectedError();
  }

  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials({
    refresh_token: data.refresh_token,
    access_token: data.access_token ?? undefined,
    expiry_date: data.token_expiry
      ? new Date(data.token_expiry).getTime()
      : undefined,
  });

  // API 呼び出しで自動リフレッシュされた際に新トークンを保存する (best-effort)。
  oauth2Client.on("tokens", (tokens) => {
    void persistRefreshedTokens(admin, userId, tokens);
  });

  return oauth2Client;
}

// 親フォルダを確保する (冪等)。既存 root_folder_id が Drive 上で実在すればそれを返し、
// 無い / 削除済みなら作成して保存する。作成したフォルダIDを返す。
export async function ensureRootFolder(userId: string): Promise<string> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("google_integrations")
    .select("root_folder_id")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    console.error("[google-drive] failed to load root_folder_id", {
      message: error.message,
      code: error.code,
    });
    throw new Error("Google連携情報の取得に失敗しました。");
  }

  const auth = await getAuthorizedClient(userId);
  const drive = google.drive({ version: "v3", auth });

  // 既存IDがあれば Drive 上で実在 (かつゴミ箱でない) か確認。OKならそれを返す (二重作成しない)。
  const existing = data?.root_folder_id ?? null;
  if (existing) {
    try {
      const res = await drive.files.get({
        fileId: existing,
        fields: "id, trashed",
      });
      if (res.data.id && !res.data.trashed) {
        return existing;
      }
      console.error("[google-drive] root folder is trashed, recreating", {
        folderId: existing,
      });
    } catch (e) {
      // 見つからない / アクセス不可 → 作り直しに倒す。
      console.error("[google-drive] root folder verify failed, recreating", e);
    }
  }

  // 作成。drive.file スコープなのでアプリが作るこのフォルダは以後アプリから触れる。
  const created = await drive.files.create({
    requestBody: {
      name: ROOT_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id",
  });
  const folderId = created.data.id;
  if (!folderId) {
    throw new Error("フォルダ作成のレスポンスにidがありません。");
  }

  const { error: upErr } = await admin
    .from("google_integrations")
    .update({ root_folder_id: folderId })
    .eq("user_id", userId);
  if (upErr) {
    console.error("[google-drive] failed to save root_folder_id", {
      message: upErr.message,
      code: upErr.code,
    });
    throw new Error("root_folder_id の保存に失敗しました。");
  }

  return folderId;
}

// フォルダ名の1セグメントをサニタイズする。フォルダ名に使えない/紛らわしい文字を _ に置換し、
// 連続スペース・連続アンダースコア・前後の余分な記号を整理する。
function sanitizeFolderSegment(s: string): string {
  return s
    .replace(/[\\/:*?"<>|]/g, "_") // / \ : * ? " < > | を _ に
    .replace(/\s+/g, " ") // 連続空白を1つに
    .replace(/_+/g, "_") // 連続 _ を1つに
    .replace(/^[\s_]+|[\s_]+$/g, "") // 前後の空白/ _ を除去
    .trim();
}

// 受注子フォルダ名 `受注番号_顧客名_車両名` を組み立てる。
// 顧客名/車両名が未登録(空)ならその部分を省略し、名前が破綻しないようにする。
function buildOrderFolderName(
  orderNo: string,
  customerName: string | null,
  vehicleName: string | null,
): string {
  const segments = [orderNo, customerName, vehicleName]
    .map((s) => (s ? sanitizeFolderSegment(s) : ""))
    .filter(Boolean);
  // 全部空という事態は受注番号があるので通常起きないが、最低限のフォールバックを置く。
  return segments.join("_") || sanitizeFolderSegment(orderNo) || "受注";
}

// フォルダを「リンクを知っている人は閲覧可（anyone:reader）」にする（冪等・best-effort）。
// 既存の anyone 権限があれば付与をスキップ（重複 create を避ける）。
// drive.file スコープでアプリが作成したファイルに対しては permissions 操作が可能（追加スコープ不要）。
// 共有付与の失敗はフォルダ作成自体を壊さない（fail-soft）。次回押下で自己修復する。
async function ensureAnyoneReader(
  drive: ReturnType<typeof google.drive>,
  fileId: string,
) {
  try {
    const existing = await drive.permissions.list({
      fileId,
      fields: "permissions(id, type, role)",
    });
    const hasAnyone = (existing.data.permissions ?? []).some(
      (p) => p.type === "anyone",
    );
    if (hasAnyone) return;

    await drive.permissions.create({
      fileId,
      requestBody: { type: "anyone", role: "reader" },
    });
  } catch (e) {
    console.error("[google-drive] failed to set anyone:reader", { fileId, e });
  }
}

// 受注ごとの子フォルダを親「HIIRAGI受注写真」配下に確保する (冪等)。
// 既存 drive_folder_id が Drive 上で実在すればその webViewLink を返し、無い/削除済みなら作成する。
// orders の読み書きは authenticated クライアント (RLS owner ポリシー準拠) で行い、user_id を明示する。
// google_integrations (トークン) 側は getAuthorizedClient/ensureRootFolder 内で admin を使う。
export async function ensureOrderFolder(
  userId: string,
  orderId: string,
): Promise<{ url: string; folderId: string }> {
  const supabase = await createClient();

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("id, customer_id, vehicle_id, drive_folder_id")
    .eq("id", orderId)
    .eq("user_id", userId)
    .maybeSingle();
  if (orderErr) {
    console.error("[google-drive] failed to load order", {
      message: orderErr.message,
      code: orderErr.code,
    });
    throw new Error("受注情報の取得に失敗しました。");
  }
  if (!order) {
    throw new Error("受注が見つかりません。");
  }

  const auth = await getAuthorizedClient(userId);
  const drive = google.drive({ version: "v3", auth });

  // 既存の子フォルダIDがあれば Drive 上で実在 (未ゴミ箱) か確認。OKならそれを返す (二重作成しない)。
  const existing = order.drive_folder_id ?? null;
  if (existing) {
    try {
      const res = await drive.files.get({
        fileId: existing,
        fields: "id, trashed, webViewLink",
      });
      if (res.data.id && !res.data.trashed && res.data.webViewLink) {
        // 既存フォルダにも共有設定を冪等に確保（様なしで作った古いフォルダの共有も自己修復）。
        await ensureAnyoneReader(drive, existing);
        return { url: res.data.webViewLink, folderId: existing };
      }
      console.error("[google-drive] order folder trashed/invalid, recreating", {
        orderId,
        existing,
      });
    } catch (e) {
      console.error("[google-drive] order folder verify failed, recreating", e);
    }
  }

  // 親フォルダを確保 (未作成の店舗でもここで親ごと作られる)。
  const rootId = await ensureRootFolder(userId);

  // 子フォルダ名の材料: 顧客名・車両名を取得 (user_id 明示)。
  const [{ data: customer }, vehicleRes] = await Promise.all([
    supabase
      .from("customers")
      .select("name")
      .eq("id", order.customer_id)
      .eq("user_id", userId)
      .maybeSingle(),
    order.vehicle_id
      ? supabase
          .from("vehicles")
          .select("maker, model")
          .eq("id", order.vehicle_id)
          .eq("user_id", userId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const customerName =
    (customer as { name: string | null } | null)?.name ?? null;
  // 顧客名には敬称「様」を一律付与（未登録時は様も付けない＝"様"だけ残さない）。
  const customerSegment = customerName ? `${customerName}様` : null;
  const vehicle = vehicleRes.data as {
    maker: string | null;
    model: string | null;
  } | null;
  const vehicleName = vehicle
    ? [vehicle.maker, vehicle.model].filter(Boolean).join(" ")
    : "";
  const folderName = buildOrderFolderName(
    order.id,
    customerSegment,
    vehicleName,
  );

  const created = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [rootId],
    },
    fields: "id, webViewLink",
  });
  const folderId = created.data.id;
  const webViewLink = created.data.webViewLink;
  if (!folderId || !webViewLink) {
    throw new Error("子フォルダ作成のレスポンスが不完全です。");
  }

  // リンクを知っている人は閲覧可に設定（お客様へ webViewLink を渡せば閲覧できる想定）。
  await ensureAnyoneReader(drive, folderId);

  // 作った子フォルダを受注に記録。webViewLink は既存UI流用のため photo_folder_url にも入れる。
  const { error: upErr } = await supabase
    .from("orders")
    .update({ drive_folder_id: folderId, photo_folder_url: webViewLink })
    .eq("id", orderId)
    .eq("user_id", userId);
  if (upErr) {
    console.error("[google-drive] failed to save order folder", {
      message: upErr.message,
      code: upErr.code,
    });
    throw new Error("受注へのフォルダ情報保存に失敗しました。");
  }

  return { url: webViewLink, folderId };
}
