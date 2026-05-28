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
      <div className="wos-pagehead">
        <div className="min-w-0 flex-1">
          <div className="wos-crumbs">
            <Link href="/dashboard/orders" className="hover:underline">
              受注一覧
            </Link>{" "}
            ／ 新規受注
          </div>
          <h1>受注を新規登録</h1>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[var(--color-cream)]">
        <div className="px-8 py-6 max-w-3xl">
          {customers.length === 0 ? (
            <div className="wos-card">
              <p className="text-sm text-[var(--color-ink-soft)]">
                顧客が登録されていません。先に
                <Link
                  href="/dashboard/customers/new"
                  className="mx-1 text-[var(--color-accent)] underline"
                >
                  顧客を登録
                </Link>
                してください。
              </p>
            </div>
          ) : (
            <OrderForm
              action={createOrder}
              customers={customers}
              defaultReceptionDate={today}
              submitLabel="登録する"
              cancelHref="/dashboard/orders"
            />
          )}
        </div>
      </div>
    </>
  );
}
