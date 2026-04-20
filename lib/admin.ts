import { createClient } from "@/lib/supabase/server";

function getAdminEmail(): string | null {
  const v = process.env.ADMIN_EMAIL?.trim();
  return v ? v.toLowerCase() : null;
}

export async function isAdmin(): Promise<boolean> {
  const adminEmail = getAdminEmail();
  if (!adminEmail) return false;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  return Boolean(email && email === adminEmail);
}
