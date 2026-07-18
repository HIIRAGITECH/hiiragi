import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DeleteButton from "@/lib/components/delete-button";
import type { Customer, Order, Vehicle } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { getSiteUrl } from "@/lib/site-url";
import { canUseMypage } from "@/lib/entitlements";
import {
  archiveOrderFormAction,
  deleteOrder,
  openEstimate,
  restoreOrderFormAction,
} from "../actions";
import DocumentOutput from "./document-output";
import MypageSection from "./mypage-section";
import OrderItemsSection from "./order-items-section";
import OrderStatusBar from "./order-status-bar";
import SaveAsSetButton from "./save-as-set-button";
// 在庫はステータス連動（了承済=確保 / 完了=消費）に一本化したため、手動在庫引きUI
// (StockDeductionSection) は引退（描画停止）。server action / RPC は保険として残置（UIからは到達不能）。

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

  // 受注ページ高速化 その2: シェル（受注行由来の軽い部分）は、明細ピッカー用の重いカタログ
  //   （parts/variants/menus/sets/set_items/set_parts/categories/indirect ＝ 8本）を待たない。
  //   ここで取得するのは「シェルに必要な軽いもの」だけ：顧客・車両・Drive連携・マイページ可否・baseUrl。
  //   重いカタログは <Suspense> 内の OrderItemsSection が別途取得する（ステータス変更後の再レンダーで
  //   カタログ取得がステータスバー等の描画をブロックしないようにするため）。
  //   canUseMypage(user) には先頭で取得済みの user を渡し、getUser() の追加往復を省く。
  const [
    { data: customerData },
    vehicleResult,
    integrationRes,
    baseUrl,
    mypageEnabled,
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
    // Googleドライブ連携 段階4: 連携済みか（refresh_token の有無）を判定するための1行。
    supabase
      .from("google_integrations")
      .select("refresh_token")
      .eq("user_id", user!.id)
      .is("deleted_at", null)
      .maybeSingle(),
    // お客様マイページ 段階2: 発行 UI のベースURL（headers のみ・DBなし）。
    getSiteUrl(),
    // 段階4: マイページ機能の使用権（管理者は無制限 / それ以外は options.mypage）。
    //   先頭で取得済みの user を渡し、getUser() の追加往復を省く。
    canUseMypage(user),
  ]);

  const customer = customerData as Customer | null;
  const vehicle = vehicleResult.data as Vehicle | null;

  // Googleドライブ連携 段階4: 連携状態（子フォルダ作成アクションは OrderItemsSection 側で bind）。
  const googleConnected = !!(
    integrationRes.data as { refresh_token: string | null } | null
  )?.refresh_token;

  const openEstimateAction = openEstimate.bind(null, order.id);

  return (
    <>
      <div className="wos-pagehead">
        <div className="min-w-0 flex-1">
          <div className="wos-crumbs">
            <Link href="/dashboard/orders" className="hover:underline">
              受注一覧
            </Link>{" "}
            ／ 受注詳細
          </div>
          <h1 className="flex items-center gap-3 flex-wrap">
            {/* 受注番号は管理番号（YYMB-0000 形式・9桁）。以前は UUID 前提の slice(0,8) で
                末尾1桁が欠けていた（例: 26MB-0006 → 26MB-000）。全桁表示する。 */}
            <span className="wos-serif-num text-2xl whitespace-nowrap">No. {order.id}</span>
            <span className="text-base text-[var(--color-ink-mid)] font-normal">
              受付 {formatDate(order.reception_date)}
            </span>
          </h1>
          <div className="wos-gloss flex flex-wrap items-center gap-3">
            <OrderStatusBar
              orderId={order.id}
              workStatus={order.work_status}
              estimateStatus={order.estimate_status}
              invoiceStatus={order.invoice_status}
            />
          </div>
        </div>
        <div className="wos-actions flex-wrap">
          <Link
            href={`/dashboard/orders/${order.id}/edit`}
            className="wos-btn-ghost wos-btn-sm"
          >
            受注情報を編集
          </Link>
          <SaveAsSetButton
            orderId={order.id}
            defaultName={
              vehicle?.maker || vehicle?.model
                ? `${[vehicle?.maker, vehicle?.model].filter(Boolean).join(" ")} 一式`
                : ""
            }
            itemsCount={(order.items ?? []).filter(
              (i) =>
                // メニュー行（work_name あり）＋ 在庫リンク済み部品行（work_name 空＋linked_part_id）
                (typeof i?.work_name === "string" && i.work_name.trim() !== "") ||
                (typeof i?.linked_part_id === "string" &&
                  i.linked_part_id !== "" &&
                  (typeof i?.work_name !== "string" ||
                    i.work_name.trim() === "")),
            ).length}
          />
          {order.is_archived ? (
            <DeleteButton
              action={restoreOrderFormAction}
              hidden={{ id: order.id }}
              confirmMessage={`受注「${order.id}」をアーカイブから復元しますか？`}
              label="アーカイブから戻す"
              className="wos-btn-ghost wos-btn-sm"
            />
          ) : (
            <DeleteButton
              action={archiveOrderFormAction}
              hidden={{ id: order.id }}
              confirmMessage={`受注「${order.id}」をアーカイブしますか？（一覧から非表示になります）`}
              label="アーカイブ"
              className="wos-btn-ghost wos-btn-sm"
            />
          )}
          <DeleteButton
            action={deleteOrder}
            hidden={{ id: order.id }}
            confirmMessage={`受注「${order.id}」を削除します。よろしいですか？`}
            label="削除"
            className="wos-btn-danger wos-btn-sm"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[var(--color-cream)]">
        <div className="px-4 sm:px-8 py-6 flex flex-col gap-6">
          {/* 顧客・車両情報 */}
          <section className="grid gap-4 sm:grid-cols-2">
            <div className="wos-card">
              <div className="wos-sec-label mb-3">顧客</div>
              {customer ? (
                <dl className="space-y-2 text-sm">
                  <DetailField
                    label="氏名"
                    value={
                      <Link
                        href={`/dashboard/customers/${customer.id}`}
                        className="text-[var(--color-ink)] font-semibold hover:underline"
                      >
                        {customer.name} 様
                      </Link>
                    }
                  />
                  <DetailField label="フリガナ" value={customer.name_kana ?? "—"} />
                  <DetailField label="電話番号" value={customer.phone ?? "—"} num />
                  <DetailField label="住所" value={customer.address ?? "—"} />
                </dl>
              ) : (
                <p className="text-sm text-[var(--color-ink-light)]">
                  顧客情報が取得できません。
                </p>
              )}
            </div>

            <div className="wos-card">
              <div className="wos-sec-label mb-3">車両</div>
              {vehicle ? (
                <dl className="space-y-2 text-sm">
                  <DetailField label="ナンバー" value={vehicle.plate_number ?? "—"} />
                  <DetailField
                    label="メーカー / 車種"
                    value={`${vehicle.maker ?? "—"} / ${vehicle.model ?? "—"}`}
                  />
                  <DetailField
                    label="年式"
                    value={vehicle.model_year ? `${vehicle.model_year}年` : "—"}
                    num
                  />
                  <DetailField label="車台番号" value={vehicle.vin ?? "—"} />
                </dl>
              ) : (
                <p className="text-sm text-[var(--color-ink-light)]">
                  {order.vehicle_id
                    ? "車両情報が取得できません。"
                    : "車両は未選択です。"}
                </p>
              )}
            </div>
          </section>

          {order.notes && (
            <section className="wos-card">
              <div className="wos-sec-label mb-2">メモ</div>
              <p className="whitespace-pre-wrap text-sm text-[var(--color-ink-soft)]">
                {order.notes}
              </p>
            </section>
          )}

          {/* 明細編集（既存 ItemsForm を維持） */}
          <section>
            <div className="wos-sec-label mb-3">明細</div>
            <div className="wos-card">
              {/* 受注ページ高速化 その2: 明細ピッカー用の重いカタログ取得は Suspense 境界の
                  OrderItemsSection に分離。シェル（ステータスバー・顧客/車両・帳票メタ）はカタログを
                  待たずに描画され、ステータス変更後の再レンダーでもカタログ取得がブロックしない。
                  ItemsForm 内部・保存・明細計算・在庫バナー・在庫は不変。 */}
              <Suspense fallback={<ItemsSectionSkeleton />}>
                <OrderItemsSection
                  userId={user!.id}
                  order={order}
                  vehicle={vehicle}
                  customer={customer}
                  googleConnected={googleConnected}
                />
              </Suspense>
            </div>
          </section>

          {/* 帳票出力 */}
          <section className="wos-card">
            <div className="wos-sec-label mb-3">帳票出力</div>
            <p className="text-sm text-[var(--color-ink-mid)] mb-4">
              内容を保存してから出力してください。「帳票を出力」では見積書・納品書・請求書・領収書を選んで
              1 つの PDF にまとめて出力できます（見積書を含めると見積ステータスが「発行済」に更新されます）。
            </p>
            <DocumentOutput
              orderId={order.id}
              customerName={customer?.name ?? null}
              invoicedAt={order.invoiced_at}
              paymentDueDate={order.payment_due_date}
              invoiceSubject={order.invoice_subject}
            />
            {/* HTML プレビュー（印刷）への既存導線は温存。見積書プレビューは従来どおり発行済に更新。 */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs text-[var(--color-ink-mid)]">
                プレビュー（印刷）:
              </span>
              <form action={openEstimateAction}>
                <button type="submit" className="wos-btn-ghost wos-btn-sm">
                  見積書
                </button>
              </form>
              <Link
                href={`/dashboard/orders/${order.id}/invoice`}
                className="wos-btn-ghost wos-btn-sm"
              >
                請求書
              </Link>
            </div>
          </section>

          {/* お客様マイページ（作業状況の共有URL） */}
          <MypageSection
            orderId={order.id}
            customerName={customer?.name ?? null}
            baseUrl={baseUrl}
            token={order.mypage_token}
            expiresAt={order.mypage_expires_at}
            enabled={mypageEnabled}
          />
        </div>
      </div>
    </>
  );
}

// 明細（カタログ取得中）のスケルトン。高さを確保してレイアウトシフトを抑える。
// カタログはピッカー用マスターなので、明細の表示・保存・在庫の正しさには影響しない。
function ItemsSectionSkeleton() {
  return (
    <div className="animate-pulse space-y-3 py-2" aria-hidden>
      <div className="h-5 w-32 rounded bg-[var(--color-line)]" />
      <div className="h-10 w-full rounded bg-[var(--color-line)]" />
      <div className="h-10 w-full rounded bg-[var(--color-line)]" />
      <div className="h-10 w-2/3 rounded bg-[var(--color-line)]" />
    </div>
  );
}

function DetailField({
  label,
  value,
  num,
}: {
  label: string;
  value: React.ReactNode;
  num?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <dt
        className="w-24 shrink-0 text-xs font-medium text-[var(--color-ink-mid)]"
        style={{ letterSpacing: "0.1em" }}
      >
        {label}
      </dt>
      <dd
        className="text-[var(--color-ink)] text-sm flex-1 min-w-0"
        style={{
          fontFamily: num ? "var(--font-num)" : undefined,
          fontVariantNumeric: num ? "tabular-nums" : undefined,
        }}
      >
        {value}
      </dd>
    </div>
  );
}
