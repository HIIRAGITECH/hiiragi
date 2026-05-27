import { isAdmin } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";
import Sidebar from "./sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const admin = await isAdmin();

  // サイドバーの件数バッジ用集計（参照のみ・既存テーブル）。
  // 失敗してもサイドバーは出すため、エラーは無視して 0 に倒す。
  const counts = await fetchSidebarCounts();

  return (
    <div className="flex flex-1 min-h-screen bg-[var(--color-cream)]">
      <Sidebar
        userEmail={user?.email ?? null}
        isAdmin={admin}
        counts={counts}
        signOutAction={signOut}
      />
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}

async function fetchSidebarCounts() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { orders: 0, payments: 0, partsAlert: 0 };

  const [ordersRes, paymentsRes, partsRes] = await Promise.all([
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_archived", false),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("invoice_status", "請求済"),
    supabase
      .from("parts_inventory")
      .select("stock_quantity, reorder_point")
      .eq("user_id", user.id)
      .is("deleted_at", null),
  ]);

  const partsAlert =
    partsRes.data?.filter(
      (p) => Number(p.stock_quantity) <= Number(p.reorder_point),
    ).length ?? 0;

  return {
    orders: ordersRes.count ?? 0,
    payments: paymentsRes.count ?? 0,
    partsAlert,
  };
}
