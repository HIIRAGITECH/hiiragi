import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DeleteButton from "@/lib/components/delete-button";
import type {
  Customer,
  IndirectMaterialEntry,
  Order,
  PartsInventory,
  PartsInventoryVariant,
  Vehicle,
  WorkItemCategory,
  WorkMenuItem,
  WorkMenuSet,
} from "@/lib/types";
import { formatDate } from "@/lib/format";
import { getSiteUrl } from "@/lib/site-url";
import { canUseMypage } from "@/lib/entitlements";
import {
  archiveOrderFormAction,
  createOrderPhotoFolder,
  deleteOrder,
  openEstimate,
  restoreOrderFormAction,
  updateOrderItems,
} from "../actions";
import ItemsForm from "./items-form";
import MypageSection from "./mypage-section";
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

  const [
    { data: customerData },
    vehicleResult,
    menusRes,
    setsRes,
    setItemsRes,
    catsRes,
    partsRes,
    indirectRes,
    pickerPartsRes,
    variantsRes,
    integrationRes,
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
    supabase
      .from("work_menu_items")
      .select("*")
      .eq("user_id", user!.id)
      .is("deleted_at", null)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true }),
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
    supabase
      .from("work_item_categories")
      .select("*")
      .eq("user_id", user!.id)
      .is("deleted_at", null)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("parts_inventory")
      .select("id, cost_price")
      .eq("user_id", user!.id),
    supabase
      .from("work_menu_indirect_materials")
      .select("menu_item_id, part_id, quantity"),
    // 「部品在庫から追加」ピッカー用: 明細に出せるアクティブ部品のみ（間接材料は除外）。
    supabase
      .from("parts_inventory")
      .select("*")
      .eq("user_id", user!.id)
      .is("deleted_at", null)
      .eq("show_in_detail", true)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true }),
    // Step 3-2b: 車種別定価ピッカー用の variant 一覧（全アクティブ）。
    // PartPickerModal 内で part_id ごとに「先頭1件の一致 variant」を採用するため
    // display_order 順で渡す（display_order 同順は created_at で安定化）。
    supabase
      .from("parts_inventory_variants")
      .select("*")
      .eq("user_id", user!.id)
      .is("deleted_at", null)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true }),
    // Googleドライブ連携 段階4: 連携済みか（refresh_token の有無）を判定するための1行。
    supabase
      .from("google_integrations")
      .select("refresh_token")
      .eq("user_id", user!.id)
      .is("deleted_at", null)
      .maybeSingle(),
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
  const allCategories = (catsRes.data ?? []) as WorkItemCategory[];
  const allParts = (pickerPartsRes.data ?? []) as PartsInventory[];
  const allVariants = (variantsRes.data ?? []) as PartsInventoryVariant[];

  const partsCostMap = new Map<string, number>();
  for (const p of (partsRes.data ?? []) as Pick<
    PartsInventory,
    "id" | "cost_price"
  >[]) {
    partsCostMap.set(p.id, Number(p.cost_price ?? 0));
  }
  const indirectByMenu: Record<string, IndirectMaterialEntry[]> = {};
  for (const e of (indirectRes.data ?? []) as {
    menu_item_id: string;
    part_id: string;
    quantity: number;
  }[]) {
    const mid = e.menu_item_id;
    if (!indirectByMenu[mid]) indirectByMenu[mid] = [];
    indirectByMenu[mid].push({
      part_id: e.part_id,
      quantity: Number(e.quantity ?? 0),
      cost_price: partsCostMap.get(e.part_id) ?? 0,
    });
  }

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

  // Googleドライブ連携 段階4: 連携状態と子フォルダ作成アクション。
  const googleConnected = !!(
    integrationRes.data as { refresh_token: string | null } | null
  )?.refresh_token;
  const createFolderAction = createOrderPhotoFolder.bind(null, order.id);

  const itemsAction = updateOrderItems.bind(null, order.id);
  const openEstimateAction = openEstimate.bind(null, order.id);

  // お客様マイページ 段階2: 発行 UI のベースURL。NEXT_PUBLIC_SITE_URL 優先、無ければ
  // リクエストヘッダから推測（dev/localhost でも動く）。
  const baseUrl = await getSiteUrl();
  // 段階4: マイページ機能の使用権（管理者は無制限 / それ以外は options.mypage）。
  const mypageEnabled = await canUseMypage();

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
              invoiceSubject={order.invoice_subject}
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
              (i) => typeof i?.work_name === "string" && i.work_name.trim() !== "",
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
        <div className="px-8 py-6 flex flex-col gap-6">
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
              <ItemsForm
                action={itemsAction}
                initialItems={order.items ?? []}
                initialDiscount={order.discount_amount}
                initialDeposit={order.deposit_amount}
                initialEstimateNotes={order.estimate_notes}
                initialInvoiceNotes={order.invoice_notes}
                initialPhotoFolderUrl={order.photo_folder_url}
                googleConnected={googleConnected}
                initialDriveFolderId={order.drive_folder_id}
                createFolderAction={createFolderAction}
                allMenus={allMenus}
                allSetsWithItems={allSetsWithItems}
                allCategories={allCategories}
                allParts={allParts}
                allVariants={allVariants}
                vehicle={vehicle}
                customer={customer}
                reservedAt={order.reserved_at}
                consumedAt={order.consumed_at}
                indirectByMenu={indirectByMenu}
              />
            </div>
          </section>

          {/* 帳票出力 */}
          <section className="wos-card">
            <div className="wos-sec-label mb-3">帳票出力</div>
            <p className="text-sm text-[var(--color-ink-mid)] mb-4">
              内容を保存してから出力してください。「見積書を出力」を押すと、見積ステータスが自動で「発行済」に更新されます。
            </p>
            <div className="flex flex-wrap gap-2">
              <form action={openEstimateAction}>
                <button type="submit" className="wos-btn wos-btn-sm">
                  見積書を出力
                </button>
              </form>
              <Link
                href={`/dashboard/orders/${order.id}/invoice`}
                className="wos-btn-ghost wos-btn-sm"
              >
                請求書を出力
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
