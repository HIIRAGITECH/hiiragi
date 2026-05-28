import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { OrderItem } from "@/lib/types";
import OrderForm, {
  type CustomerOption,
  type DuplicateContext,
} from "../order-form";
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

export default async function NewOrderPage(
  props: PageProps<"/dashboard/orders/new">,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const searchParams = await props.searchParams;
  const rawDup = searchParams?.duplicate;
  const duplicateFromId = typeof rawDup === "string" && rawDup !== "" ? rawDup : null;

  // 複製モード時は複製元の受注（items / discount_amount / notes）を取得して
  // プレビュー＋ notes 初期値に流し込む。所有者違いなら null（一覧へ戻す経路でも可）。
  let duplicate: DuplicateContext | null = null;
  let dupNotes: string | null = null;
  if (duplicateFromId) {
    const { data: src } = await supabase
      .from("orders")
      .select("id, items, discount_amount, notes")
      .eq("id", duplicateFromId)
      .eq("user_id", user!.id)
      .maybeSingle();
    if (src) {
      const items = (src.items ?? []) as OrderItem[];
      duplicate = {
        sourceId: src.id as string,
        itemsPreview: items
          .filter((i) => (i.work_name ?? "").trim() !== "")
          .map((i) => ({
            work_name: i.work_name,
            quantity: Number(i.quantity ?? 0),
          })),
        discountAmount: Number(src.discount_amount ?? 0),
      };
      dupNotes = (src.notes as string | null) ?? null;
    }
  }

  const { data } = await supabase
    .from("customers")
    .select("id, name, vehicles(id, plate_number, maker, model)")
    .eq("user_id", user!.id)
    .order("id", { ascending: true });

  const customers = buildOptions((data ?? []) as unknown as CustomerWithVehicles[]);
  const today = new Date().toISOString().slice(0, 10);

  const headline = duplicate ? "受注を複製して登録" : "受注を新規登録";
  const crumb = duplicate ? "受注を複製" : "新規受注";

  return (
    <>
      <div className="wos-pagehead">
        <div className="min-w-0 flex-1">
          <div className="wos-crumbs">
            <Link href="/dashboard/orders" className="hover:underline">
              受注一覧
            </Link>{" "}
            ／ {crumb}
          </div>
          <h1>{headline}</h1>
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
          ) : duplicateFromId && !duplicate ? (
            <div className="wos-card">
              <p className="text-sm text-[var(--color-ink-soft)]">
                複製元の受注「{duplicateFromId}」が見つかりません。
                <Link
                  href="/dashboard/orders/new"
                  className="mx-1 text-[var(--color-accent)] underline"
                >
                  通常の新規登録
                </Link>
                に切り替えますか？
              </p>
            </div>
          ) : (
            <OrderForm
              action={createOrder}
              customers={customers}
              defaultReceptionDate={today}
              defaultNotes={dupNotes}
              submitLabel={duplicate ? "複製して登録" : "登録する"}
              cancelHref="/dashboard/orders"
              duplicate={duplicate ?? undefined}
            />
          )}
        </div>
      </div>
    </>
  );
}
