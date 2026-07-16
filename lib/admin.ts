import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

function getAdminEmail(): string | null {
  const v = process.env.ADMIN_EMAIL?.trim();
  return v ? v.toLowerCase() : null;
}

// 高速化: 呼び出し側が既に取得済みの user を渡せば getUser() のネットワーク往復を省く。
//   - user を渡した場合（null 含む）＝その user で判定し、getUser しない。
//   - 引数なし（undefined）＝従来どおり getUser で取得する（既存呼び出しは無改修で動く）。
export async function isAdmin(user?: User | null): Promise<boolean> {
  const adminEmail = getAdminEmail();
  if (!adminEmail) return false;

  let resolved = user;
  if (resolved === undefined) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    resolved = data.user;
  }
  const email = resolved?.email?.toLowerCase();
  return Boolean(email && email === adminEmail);
}
