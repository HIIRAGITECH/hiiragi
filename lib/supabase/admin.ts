import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// service role キーを使う管理用クライアント。
// RLS をバイパスして auth.users 等のシステムテーブルを操作できる。
// 必ず server 側でだけ呼ぶこと（"server-only" import で client から import すると build エラーになる）。
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY または NEXT_PUBLIC_SUPABASE_URL が設定されていません。",
    );
  }
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
