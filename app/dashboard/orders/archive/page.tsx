import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { OrderItem, OrderListRow } from "@/lib/types";
import ArchiveTable from "./archive-table";

export const metadata: Metadata = {
  title: "アーカイブ受注 | HIIRAGI",
};

// 一覧表示用の行 + 金額計算用に items / discount_amount を追加
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

  // 年の境界（JST）。invoiced_at で絞り込む。
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
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          アーカイブ受注
        </h2>
        <Link
          href="/dashboard/orders"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          ← 受注一覧へ戻る
        </Link>
      </div>

      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        アーカイブ済みの受注を、請求日（invoiced_at）の月でグループ化して表示します。
      </p>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          アーカイブ一覧の取得に失敗しました: {error.message}
        </p>
      )}

      <div className="mt-4">
        <ArchiveTable rows={orders} year={year} />
      </div>
    </>
  );
}
