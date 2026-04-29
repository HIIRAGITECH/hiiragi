import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DeleteButton from "@/lib/components/delete-button";
import type { Customer, Order, Vehicle } from "@/lib/types";
import { formatDate } from "@/lib/format";
import {
  deleteOrder,
  openEstimate,
  updateOrderItems,
  updatePhotoFolderUrl,
} from "../actions";
import {
  EstimateStatusBadge,
  WorkStatusBadge,
} from "../status-badge";
import ItemsForm from "./items-form";
import PhotoFolderForm from "./photo-folder-form";

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

  const [{ data: customerData }, vehicleResult] = await Promise.all([
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
  ]);

  const customer = customerData as Customer | null;
  const vehicle = vehicleResult.data as Vehicle | null;

  const itemsAction = updateOrderItems.bind(null, order.id);
  const openEstimateAction = openEstimate.bind(null, order.id);
  const photoFolderAction = updatePhotoFolderUrl.bind(null, order.id);

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
            <div className="flex items-center gap-3">
              <h2 className="font-mono text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                {order.id}
              </h2>
              <WorkStatusBadge value={order.work_status} />
              <EstimateStatusBadge
                value={order.estimate_status}
                orderId={order.id}
              />
            </div>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              受付日: {formatDate(order.reception_date)}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/dashboard/orders/${order.id}/edit`}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              受注情報を編集
            </Link>
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
          />
        </div>
      </section>

      {/* 写真フォルダ */}
      <section className="mt-8">
        <h3 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          整備写真フォルダ
        </h3>
        <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
            Google Drive 等の整備写真を保管しているフォルダURLを登録します。
          </p>
          <PhotoFolderForm
            action={photoFolderAction}
            initialUrl={order.photo_folder_url}
          />
        </div>
      </section>

      {/* 見積/請求 出力 */}
      <section className="mt-8 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="mb-3 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          帳票出力
        </h3>
        <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
          明細を保存してから出力してください。「見積書を作成・印刷」を押すと、見積ステータスが自動で「見積済」に更新されます。
        </p>
        <div className="flex flex-wrap gap-2">
          <form action={openEstimateAction}>
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              見積書を作成・印刷
            </button>
          </form>
          <Link
            href={`/dashboard/orders/${order.id}/invoice`}
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            請求書を印刷
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
