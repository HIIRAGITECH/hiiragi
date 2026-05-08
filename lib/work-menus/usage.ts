import { createClient } from "@/lib/supabase/server";
import type { OrderItem, WorkMenuSet } from "@/lib/types";

export type WorkMenuUsage = {
  // 過去受注（アーカイブ含む）の明細で source_menu_id がこの ID と一致する件数。
  orderItemCount: number;
  // 含まれているアクティブな作業セット数（= sets.length）。
  setCount: number;
  // 含まれているアクティブな作業セットの実体（名称表示用）。display_order 順。
  sets: WorkMenuSet[];
};

// 指定したメニュー ID の使用回数を集計する。
// orders.items は jsonb 配列なので JS 側で走査する（典型ボリュームでは十分軽量）。
// 作業セット側はアクティブ（deleted_at IS NULL）のみカウントする。
export async function countWorkMenuUsage(
  menuId: string,
): Promise<WorkMenuUsage> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("認証エラー: 再度ログインしてください。");

  // 1) 過去明細での使用件数
  const { data: ordersData, error: oErr } = await supabase
    .from("orders")
    .select("items")
    .eq("user_id", user.id);
  if (oErr) throw new Error(`受注の取得に失敗: ${oErr.message}`);
  let orderItemCount = 0;
  for (const o of ordersData ?? []) {
    const items = (o.items as OrderItem[] | null) ?? [];
    for (const it of items) {
      if (it.source_menu_id === menuId) orderItemCount++;
    }
  }

  // 2) アクティブセットでの参照
  const { data: links } = await supabase
    .from("work_menu_set_items")
    .select("set_id")
    .eq("menu_item_id", menuId);
  const setIds = Array.from(new Set((links ?? []).map((l) => l.set_id)));

  let sets: WorkMenuSet[] = [];
  if (setIds.length > 0) {
    const { data } = await supabase
      .from("work_menu_sets")
      .select("*")
      .in("id", setIds)
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });
    sets = (data ?? []) as WorkMenuSet[];
  }

  return {
    orderItemCount,
    setCount: sets.length,
    sets,
  };
}
