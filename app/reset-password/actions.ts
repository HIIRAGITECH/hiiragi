"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";

export type ResetState = { error: string } | undefined;

export async function requestReset(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    return { error: "メールアドレスを入力してください。" };
  }

  const supabase = await createClient();
  const siteUrl = await getSiteUrl();

  // メール存在の有無を漏らさないため、エラーが起きても成功画面に遷移させる。
  // 重大なエラーはサーバログで確認する。
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=/update-password`,
  });
  if (error) {
    console.error("resetPasswordForEmail:", error.message);
  }

  redirect("/login?reset=sent");
}
