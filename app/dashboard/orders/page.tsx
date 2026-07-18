import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { calculateTotals } from "@/lib/orders/totals";
import { getSiteUrl } from "@/lib/site-url";
import { canUseMypage } from "@/lib/entitlements";
import type { OrderItem, OrderListRow } from "@/lib/types";
import OrdersTable, { type OrderKanbanRow } from "./orders-table";

export const metadata: Metadata = {
  title: "受注一覧 | HIIRAGI",
};

export default async function OrdersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, reception_date, work_status, estimate_status, invoice_status, invoiced_at, paid_at, payment_due_date, invoice_subject, is_archived, notes, items, discount_amount, deposit_amount, mypage_token, mypage_expires_at, customer:customers(id,name,name_kana), vehicle:vehicles(id,maker,model,plate_number)",
    )
    .eq("user_id", user!.id)
    .eq("is_archived", false)
    .order("id", { ascending: false });

  type FetchedRow = OrderListRow & {
    items: OrderItem[] | null;
    discount_amount: number | null;
    deposit_amount: number | null;
    mypage_token: string | null;
    mypage_expires_at: string | null;
  };

  const raw = (data ?? []) as unknown as FetchedRow[];

  // 金額（total）をサーバ側で先に計算してテーブルに渡す。
  const orders: OrderKanbanRow[] = raw.map((o) => {
    const totals = calculateTotals(
      o.items ?? [],
      o.discount_amount ?? 0,
      o.deposit_amount ?? 0,
    );
    return {
      id: o.id,
      reception_date: o.reception_date,
      work_status: o.work_status,
      estimate_status: o.estimate_status,
      invoice_status: o.invoice_status,
      invoiced_at: o.invoiced_at,
      paid_at: o.paid_at,
      payment_due_date: o.payment_due_date,
      invoice_subject: o.invoice_subject,
      is_archived: o.is_archived,
      notes: o.notes,
      customer: o.customer,
      vehicle: o.vehicle,
      amount: totals.total > 0 ? totals.total : null,
      mypage_token: o.mypage_token,
      mypage_expires_at: o.mypage_expires_at,
    };
  });

  // 高速化: 直列だった getSiteUrl / canUseMypage を並列化し、canUseMypage には取得済み user を渡して
  //   getUser() の追加往復を省く（挙動不変）。
  const [baseUrl, mypageEnabled] = await Promise.all([
    // マイページURL コピー/発行 導線のベースURL（NEXT_PUBLIC_SITE_URL 優先、無ければヘッダ推測）。
    getSiteUrl(),
    // 段階4: マイページ機能の使用権（未発行の発行ボタンの出し分けに使う）。
    canUseMypage(user),
  ]);

  return (
    <>
      <div className="wos-pagehead">
        <div className="min-w-0 flex-1">
          <div className="wos-crumbs">ダッシュボード ／ 受注一覧</div>
          <h1>受注一覧</h1>
          <div className="wos-gloss">
            進行中の受注 {orders.length} 件。作業ステータス別に表示しています。
          </div>
        </div>
        <div className="wos-actions">
          <Link
            href="/dashboard/orders/archive"
            className="wos-btn-ghost wos-btn-sm"
          >
            アーカイブ
          </Link>
          <Link href="/dashboard/orders/new" className="wos-btn wos-btn-sm">
            ＋ 新規受注を作成
          </Link>
        </div>
      </div>

      {error && (
        <div className="px-4 sm:px-8 pt-4">
          <p className="wos-alert warn">
            受注一覧の取得に失敗しました: {error.message}
          </p>
        </div>
      )}

      <OrdersTable rows={orders} baseUrl={baseUrl} mypageEnabled={mypageEnabled} />
    </>
  );
}
