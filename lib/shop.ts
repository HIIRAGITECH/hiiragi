import { createClient } from "@/lib/supabase/server";
import type { ShopInfo } from "@/lib/types";

export async function getShopInfo(): Promise<ShopInfo> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const meta = (user?.user_metadata ?? {}) as Partial<ShopInfo>;
  return {
    shop_name: meta.shop_name ?? "",
    address: meta.address ?? "",
    phone: meta.phone ?? "",
    registration_no: meta.registration_no ?? "",
  };
}
