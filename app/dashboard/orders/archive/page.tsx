import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { OrderItem, OrderListRow } from "@/lib/types";
import ArchiveTable from "./archive-table";

export const metadata: Metadata = {
  title: "アーカイブ受注 | HIIRAGI",
};

type ArchiveRow = OrderListRow & {
  items: OrderItem[];
  discount_amount: number;
};

function pickInt(v: string | undefined, fallback: number): number {
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const year = pickInt(sp.year, now.getFullYear());

  const start = `${year}-01-01T00:00:00+09:00`;
  const end = `${year + 1}-01-01T00:00:00+09:00`;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, reception_date, work_status, estimate_status, invoice_status, invoiced_at, paid_at, payment_due_date, invoice_subject, is_archived, notes, items, discount_amount, customer:customers(id,name,name_kana), vehicle:vehicles(id,maker,model,plate_number)",
    )
    .eq("user_id", user!.id)
    .eq("is_archived", true)
    .gte("invoiced_at", start)
    .lt("invoiced_at", end)
    .order("reception_date", { ascending: false });

  const orders = (data ?? []) as unknown as ArchiveRow[];

  return (
    <>
      <div className="wos-pagehead">
        <div className="min-w-0 flex-1">
          <div className="wos-crumbs">
            <Link href="/dashboard/orders" className="hover:underline">
              受注一覧
            </Link>{" "}
            ／ アーカイブ
          </div>
          <h1>アーカイブ受注（{year}年）</h1>
          <div className="wos-gloss">
            請求日（invoiced_at）の月でグループ化して表示しています。
          </div>
        </div>
        <div className="wos-actions">
          <Link href="/dashboard/orders" className="wos-btn-ghost wos-btn-sm">
            ← 受注一覧へ戻る
          </Link>
        </div>
      </div>

      {error && (
        <div className="px-4 sm:px-8 pt-4">
          <p className="wos-alert warn">
            アーカイブ一覧の取得に失敗しました: {error.message}
          </p>
        </div>
      )}

      <div className="flex-1 overflow-auto bg-[var(--color-cream)]">
        <div className="px-4 sm:px-8 py-6">
          <ArchiveTable rows={orders} year={year} />
        </div>
      </div>
    </>
  );
}
