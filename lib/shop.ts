import { createClient } from "@/lib/supabase/server";
import type { BankAccountType, BankInfo, ShopInfo } from "@/lib/types";

export async function getShopInfo(): Promise<ShopInfo> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const meta = (user?.user_metadata ?? {}) as Partial<ShopInfo>;

  const rawBank = meta.bank_info as Partial<BankInfo> | undefined;
  const bank_info: BankInfo | undefined = rawBank
    ? {
        bank_name: rawBank.bank_name ?? "",
        branch_name: rawBank.branch_name ?? "",
        account_type: (rawBank.account_type === "当座"
          ? "当座"
          : "普通") satisfies BankAccountType,
        account_number: rawBank.account_number ?? "",
        account_holder: rawBank.account_holder ?? "",
      }
    : undefined;

  return {
    shop_name: meta.shop_name ?? "",
    address: meta.address ?? "",
    phone: meta.phone ?? "",
    registration_no: meta.registration_no ?? "",
    logo_path: meta.logo_path ?? null,
    stamp_path: meta.stamp_path ?? null,
    bank_info,
  };
}

// 表示用の signed URL を取得（private バケットのため）
export async function getShopAssetSignedUrl(
  path: string | null,
  expiresInSec = 3600,
): Promise<string | null> {
  if (!path) return null;
  const supabase = await createClient();
  const { data } = await supabase.storage
    .from("shop-assets")
    .createSignedUrl(path, expiresInSec);
  return data?.signedUrl ?? null;
}
