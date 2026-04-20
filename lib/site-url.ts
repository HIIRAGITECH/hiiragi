import { headers } from "next/headers";

// Supabase の emailRedirectTo / resetPasswordForEmail に渡す絶対URLを構築する。
// NEXT_PUBLIC_SITE_URL があれば優先、なければリクエストヘッダから推測。
export async function getSiteUrl(): Promise<string> {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  const h = await headers();
  const host =
    h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const protocol =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}
