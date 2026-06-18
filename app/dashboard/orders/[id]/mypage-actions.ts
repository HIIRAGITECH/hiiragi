"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { canUseMypage } from "@/lib/entitlements";

// お客様マイページ 段階2: マイページURL用トークンの発行・再発行・失効。
//
// 方針:
//   - 書き込みは既存 orders と同じ作法（authenticated クライアント + RLS owner +
//     .eq("user_id") 明示）。service_role は使わない（業務テーブルは authenticated のみDML）。
//   - トークンは crypto で生成した URL セーフな乱数（base64url, 32バイト=43文字）。
//   - 有効期限は発行/再発行時点から 45 日後。失効は token / expires_at を NULL に戻す。
//   - 課金連動（options.mypage）はこのステップでは入れない（Step 4 で一括）。
//
// 表示ページ（/mypage/[token]）は Step 3 で実装するため、この時点で発行した URL を
// 開いても 404 になるのは想定内。

const EXPIRY_DAYS = 45;

export type MypageTokenResult =
  | { error: string }
  | { success: true; token: string; expiresAt: string };

export type MypageRevokeResult = { error: string } | { success: true };

// 暗号学的に安全な URL セーフトークン。base64url は + / = を含まないため
// そのまま URL パスに載せられる。32 バイト → 43 文字（要件の「32文字以上」を満たす）。
function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

function expiryFromNow(): string {
  return new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

// 新しいトークンと有効期限をセットする共通処理。
// issue（未発行→発行）と regenerate（発行済→上書き）はどちらもこの「新トークンで上書き」で
// 表現できる。古いトークンは上書きで参照不能になる＝漏洩時の無効化になる。
async function setFreshToken(orderId: string): Promise<MypageTokenResult> {
  if (!orderId) return { error: "受注 ID が不正です。" };

  // ★サーバーガード★ UI を隠すだけでなく、発行/再発行アクション自体でも使用権を確認する。
  // （API を直接叩かれても、使用権がなければトークンを発行させない）
  if (!(await canUseMypage())) {
    return {
      error:
        "お客様マイページはオプション機能です。プラン管理から有効化してください。",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  const token = generateToken();
  const expiresAt = expiryFromNow();

  const { error } = await supabase
    .from("orders")
    .update({ mypage_token: token, mypage_expires_at: expiresAt })
    .eq("id", orderId)
    .eq("user_id", user.id);
  if (error) {
    return { error: `マイページURLの発行に失敗しました: ${error.message}` };
  }

  revalidatePath(`/dashboard/orders/${orderId}`);
  revalidatePath("/dashboard/orders");
  return { success: true, token, expiresAt };
}

// 発行: 未発行の受注にマイページトークンを新規発行する。
export async function issueMypageToken(
  orderId: string,
): Promise<MypageTokenResult> {
  return setFreshToken(orderId);
}

// 再発行: 新しいトークンで上書きする（古い URL は無効になる＝漏洩対策）。
// 有効期限も発行日 +45 日で更新する。
export async function regenerateMypageToken(
  orderId: string,
): Promise<MypageTokenResult> {
  return setFreshToken(orderId);
}

// 失効: token / expires_at を NULL に戻し、URL を無効化する。
// 使用権ガードは掛けない（無効化＝機能を止める方向の操作なので、解約後でも常に実行できてよい）。
export async function revokeMypageToken(
  orderId: string,
): Promise<MypageRevokeResult> {
  if (!orderId) return { error: "受注 ID が不正です。" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  const { error } = await supabase
    .from("orders")
    .update({ mypage_token: null, mypage_expires_at: null })
    .eq("id", orderId)
    .eq("user_id", user.id);
  if (error) {
    return { error: `マイページURLの無効化に失敗しました: ${error.message}` };
  }

  revalidatePath(`/dashboard/orders/${orderId}`);
  revalidatePath("/dashboard/orders");
  return { success: true };
}
