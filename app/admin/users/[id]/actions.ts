"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  SUBSCRIPTION_OPTION_KEYS,
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_STATUSES,
  type SubscriptionOptions,
  type SubscriptionPlan,
  type SubscriptionStatus,
} from "@/lib/types";

export type UpdateSubscriptionState =
  | { error: string }
  | { success: true }
  | undefined;

export async function updateSubscription(
  _prev: UpdateSubscriptionState,
  formData: FormData,
): Promise<UpdateSubscriptionState> {
  if (!(await isAdmin())) {
    redirect("/dashboard");
  }

  const userId = String(formData.get("user_id") ?? "");
  if (!userId) return { error: "user_id が指定されていません。" };

  const plan = String(formData.get("plan") ?? "") as SubscriptionPlan;
  const status = String(formData.get("status") ?? "") as SubscriptionStatus;

  if (!(SUBSCRIPTION_PLANS as readonly string[]).includes(plan)) {
    return { error: "プランの値が不正です。" };
  }
  if (!(SUBSCRIPTION_STATUSES as readonly string[]).includes(status)) {
    return { error: "ステータスの値が不正です。" };
  }

  const options: SubscriptionOptions = {};
  for (const key of SUBSCRIPTION_OPTION_KEYS) {
    options[key] = formData.get(`opt_${key}`) === "on";
  }

  const memoRaw = formData.get("memo");
  const memo =
    typeof memoRaw === "string" && memoRaw.trim() !== "" ? memoRaw : null;

  const trialRaw = formData.get("trial_ends_at");
  // <input type="date"> から渡される YYYY-MM-DD をその日の終わり 23:59:59 として保存。
  let trialEndsAt: string | null = null;
  if (typeof trialRaw === "string" && trialRaw.trim() !== "") {
    const d = new Date(`${trialRaw}T23:59:59`);
    if (Number.isNaN(d.getTime())) {
      return { error: "トライアル期限の日付が不正です。" };
    }
    trialEndsAt = d.toISOString();
  }

  const admin = createAdminClient();

  // 既存行があれば UPDATE、無ければ INSERT。1 ユーザ 1 行の前提で upsert する。
  const { error } = await admin
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        plan,
        status,
        trial_ends_at: trialEndsAt,
        options,
        memo,
      },
      { onConflict: "user_id" },
    );

  if (error) {
    return { error: `保存に失敗しました: ${error.message}` };
  }

  revalidatePath("/admin");
  revalidatePath(`/admin/users/${userId}`);
  return { success: true };
}
