"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type UpdatePasswordState = { error: string } | undefined;

export async function updatePassword(
  _prev: UpdatePasswordState,
  formData: FormData,
): Promise<UpdatePasswordState> {
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("password_confirm") ?? "");

  if (!password) {
    return { error: "新しいパスワードを入力してください。" };
  }
  if (password.length < 6) {
    return { error: "パスワードは6文字以上にしてください。" };
  }
  if (password !== passwordConfirm) {
    return { error: "パスワードと確認用パスワードが一致しません。" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "セッションが切れています。リセットメールから再度開いてください。" };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { error: `更新に失敗しました: ${error.message}` };
  }

  // パスワード更新後は念のためサインアウトしてログイン画面へ
  await supabase.auth.signOut();
  redirect("/login?password=updated");
}
