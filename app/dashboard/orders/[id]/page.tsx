import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DeleteButton from "@/lib/components/delete-button";
import type {
  Customer,
  Order,
  Vehicle,
  WorkMenuItem,
  WorkMenuSet,
} from "@/lib/types";
import { formatDate } from "@/lib/format";
import {
  archiveOrderFormAction,
  deleteOrder,
  openEstimate,
  restoreOrderFormAction,
  updateOrderItems,
} from "../actions";
import ItemsForm from "./items-form";
import OrderStatusBar from "./order-status-bar";

export const metadata: Metadata = {
  title: "受注詳細 | HIIRAGI",
};

export default async function OrderDetailPage(
  props: PageProps<"/dashboard/orders/[id]">,
) {
  const { id } = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: orderData } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .eq("user_id", user!.id)
    .maybeSingle();

  if (!orderData) notFound();
  const order = orderData as Order;

  const [
    { data: customerData },
    vehicleResult,
    menusRes,
    setsRes,
    setItemsRes,
  ] = await Promise.all([
    supabase
      .from("customers")
      .select("*")
      .eq("id", order.customer_id)
      .eq("user_id", user!.id)
      .maybeSingle(),
    order.vehicle_id
      ? supabase
          .from("vehicles")
          .select("*")
          .eq("id", order.vehicle_id)
          .eq("user_id", user!.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    // 明細フォームの「メニューから追加」picker 用（非表示は除外）
    supabase
      .from("work_menu_items")
      .select("*")
      .eq("user_id", user!.id)
      .is("deleted_at", null)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true }),
    // 明細フォームの「セットから追加」picker 用（非表示セットは除外）
    supabase
      .from("work_menu_sets")
      .select("*")
      .eq("user_id", user!.id)
      .is("deleted_at", null)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("work_menu_set_items")
      .select("set_id, menu_item_id, position")
      .order("position", { ascending: true }),
  ]);

  const customer = customerData as Customer | null;
  const vehicle = vehicleResult.data as Vehicle | null;
  const allMenus = (menusRes.data ?? []) as WorkMenuItem[];
  const allSets = (setsRes.data ?? []) as WorkMenuSet[];
  const allSetItems = (setItemsRes.data ?? []) as {
    set_id: string;
    menu_item_id: string;
    position: number;
  }[];
  // セットを「中身を menu 解決済み配列で持つ」形にして渡す
  const menuMap = new Map(allMenus.map((m) => [m.id, m]));
  const allSetsWithItems = allSets.map((s) => ({
    set: s,
    items: allSetItems
      .filter((l) => l.set_id === s.id)
      .map((l) => {
        const menu = menuMap.get(l.menu_item_id);
        return menu ? { menu, position: l.position } : null;
      })
      .filter((x): x is { menu: WorkMenuItem; position: number } => !!x)
      .sort((a, b) => a.position - b.position),
  }));

  const itemsAction = updateOrderItems.bind(null, order.id);
  const openEstimateAction = openEstimate.bind(null, order.id);

  return (
    <>
      <div className="mb-6">
        <Link
          href="/dashboard/orders"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          ← 受注一覧に戻る
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-mono text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                {order.id}
              </h2>
              <OrderStatusBar
                orderId={order.id}
                workStatus={order.work_status}
                estimateStatus={order.estimate_status}
                invoiceStatus={order.invoice_status}
              />
            </div>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              受付日: {formatDate(order.reception_date)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/dashboard/orders/${order.id}/edit`}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              受注情報を編集
            </Link>
            {order.is_archived ? (
              <DeleteButton
                action={restoreOrderFormAction}
                hidden={{ id: order.id }}
                confirmMessage={`受注「${order.id}」をアーカイブから復元しますか？`}
                label="アーカイブから戻す"
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              />
            ) : (
              <DeleteButton
                action={archiveOrderFormAction}
                hidden={{ id: order.id }}
                confirmMessage={`受注「${order.id}」をアーカイブしますか？（一覧から非表示になります）`}
                label="アーカイブ"
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              />
            )}
            <DeleteButton
              action={deleteOrder}
              hidden={{ id: order.id }}
              confirmMessage={`受注「${order.id}」を削除します。よろしいですか？`}
              label="削除"
            />
          </div>
        </div>
      </div>

      {/* 顧客・車両情報 */}
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            顧客
          </h3>
          {customer ? (
            <dl className="space-y-1.5 text-sm">
              <Field
                label="氏名"
                value={
                  <Link
                    href={`/dashboard/customers/${customer.id}`}
                    className="text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-50"
                  >
                    {customer.name}
                  </Link>
                }
              />
              <Field label="フリガナ" value={customer.name_kana ?? "—"} />
              <Field label="電話番号" value={customer.phone ?? "—"} />
              <Field label="住所" value={customer.address ?? "—"} />
            </dl>
          ) : (
            <p className="text-sm text-zinc-500">顧客情報が取得できません。</p>
          )}
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            車両
          </h3>
          {vehicle ? (
            <dl className="space-y-1.5 text-sm">
              <Field label="ナンバー" value={vehicle.plate_number ?? "—"} />
              <Field
                label="メーカー / 車種"
                value={`${vehicle.maker ?? "—"} / ${vehicle.model ?? "—"}`}
              />
              <Field
                label="年式"
                value={vehicle.model_year ? `${vehicle.model_year}年` : "—"}
              />
              <Field label="車台番号" value={vehicle.vin ?? "—"} />
            </dl>
          ) : (
            <p className="text-sm text-zinc-500">
              {order.vehicle_id
                ? "車両情報が取得できません。"
                : "車両は未選択です。"}
            </p>
          )}
        </div>
      </section>

      {order.notes && (
        <section className="mt-4 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            メモ
          </h3>
          <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
            {order.notes}
          </p>
        </section>
      )}

      {/* 明細編集 */}
      <section className="mt-8">
        <h3 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          明細
        </h3>
        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <ItemsForm
            action={itemsAction}
            initialItems={order.items ?? []}
            initialDiscount={order.discount_amount}
            initialDeposit={order.deposit_amount}
            initialEstimateNotes={order.estimate_notes}
            initialInvoiceNotes={order.invoice_notes}
            initialPhotoFolderUrl={order.photo_folder_url}
            allMenus={allMenus}
            allSetsWithItems={allSetsWithItems}
          />
        </div>
      </section>

      {/* 整備写真フォルダの入力は ItemsForm 内に統合済み（「内容を保存」で一括保存）。 */}

      {/* 見積/請求 出力 */}
      <section className="mt-8 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          帳票出力
        </h3>
        <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
          内容を保存してから出力してください。「見積書を出力」を押すと、見積ステータスが自動で「見積済」に更新されます。
        </p>
        <div className="flex flex-wrap gap-2">
          <form action={openEstimateAction}>
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              見積書を出力
            </button>
          </form>
          <Link
            href={`/dashboard/orders/${order.id}/invoice`}
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            請求書を出力
          </Link>
        </div>
      </section>
    </>
  );
}

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="w-24 shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
        {label}
      </dt>
      <dd className="text-zinc-900 dark:text-zinc-100">{value}</dd>
    </div>
  );
}
