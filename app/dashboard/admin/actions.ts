"use server";

import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function deleteUser(formData: FormData) {
  // 二重防御: 管理者のみ実行可
  if (!(await isAdmin())) return;

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  // 自分自身の削除は禁止
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id === id) return;

  const admin = createAdminClient();
  await admin.auth.admin.deleteUser(id);
  // customers / vehicles / orders は user_id の ON DELETE CASCADE で連動削除される

  revalidatePath("/dashboard/admin");
}
