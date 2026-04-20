import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import OrderForm, { type CustomerOption } from "../order-form";
import { createOrder } from "../actions";

export const metadata: Metadata = {
  title: "受注 新規登録 | HIIRAGI",
};

type CustomerWithVehicles = {
  id: string;
  name: string;
  vehicles: {
    id: string;
    plate_number: string | null;
    maker: string | null;
    model: string | null;
  }[];
};

function buildOptions(rows: CustomerWithVehicles[]): CustomerOption[] {
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    vehicles: (c.vehicles ?? []).map((v) => ({
      id: v.id,
      label:
        [v.plate_number, v.maker, v.model].filter(Boolean).join(" / ") || v.id,
    })),
  }));
}

export default async function NewOrderPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("customers")
    .select("id, name, vehicles(id, plate_number, maker, model)")
    .eq("user_id", user!.id)
    .order("id", { ascending: true });

  const customers = buildOptions((data ?? []) as unknown as CustomerWithVehicles[]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="mb-6">
        <Link
          href="/dashboard/orders"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          ← 受注一覧に戻る
        </Link>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          受注 新規登録
        </h2>
      </div>

      {customers.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            顧客が登録されていません。先に
            <Link
              href="/dashboard/customers/new"
              className="mx-1 text-zinc-900 underline dark:text-zinc-50"
            >
              顧客を登録
            </Link>
            してください。
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <OrderForm
            action={createOrder}
            customers={customers}
            defaultReceptionDate={today}
            submitLabel="登録する"
            cancelHref="/dashboard/orders"
          />
        </div>
      )}
    </>
  );
}
