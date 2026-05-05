// react-pdf の Image は alt prop を受け付けないため、jsx-a11y/alt-text は本ファイルでは無視する。
/* eslint-disable jsx-a11y/alt-text */
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import { formatDate, formatYen } from "@/lib/format";
import { calculateTotals, rowSubtotal } from "@/lib/orders/totals";
import type {
  BankInfo,
  Customer,
  Order,
  OrderItem,
  ShopInfo,
  Vehicle,
} from "@/lib/types";
import { registerJapaneseFont } from "./fonts";

registerJapaneseFont();

export type PdfDocumentType = "estimate" | "invoice";

interface InvoiceDocumentProps {
  documentType: PdfDocumentType;
  order: Order;
  customer: Customer | null;
  vehicle: Vehicle | null;
  shop: ShopInfo;
  // 事前 fetch 済みのバイナリ。fail-soft（取得失敗時は null で省略表示）。
  logoBuffer: Buffer | null;
  stampBuffer: Buffer | null;
}

const COLORS = {
  black: "#1e1e1e",
  gray: "#646464",
  primary: "#21405f",
  tableLine: "#c8c8c8",
  categoryBand: "#e6ebf5",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 25 * 2.83465, // 25mm（continuation header 用に確保）
    paddingBottom: 15 * 2.83465,
    paddingLeft: 15 * 2.83465,
    paddingRight: 15 * 2.83465,
    fontFamily: "NotoSansJP",
    fontSize: 9,
    color: COLORS.black,
    lineHeight: 1.35,
  },
  // 透かし: 全ページの中央に薄く配置
  watermark: {
    position: "absolute",
    top: "30%",
    left: "20%",
    width: "60%",
    opacity: 0.06,
  },
  // 2ページ目以降のヘッダー（外枠は位置決めのみ。ボーダーは inner でだけ描く
  // 仕組みにして、1ページ目に空のボーダーが残らないようにする）
  continuationOuter: {
    position: "absolute",
    top: 28,
    left: 15 * 2.83465,
    right: 15 * 2.83465,
  },
  continuationInner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 6,
    borderBottomWidth: 0.85,
    borderBottomColor: COLORS.primary,
  },
  continuationTitle: {
    fontSize: 11,
    fontWeight: "bold",
    color: COLORS.primary,
  },
  continuationCenter: { fontSize: 9, color: COLORS.gray },
  continuationRight: { fontSize: 9, color: COLORS.gray },

  // ─── 1ページ目 ヘッダー領域 ───────────────────────────
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  titleCenter: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "bold",
    letterSpacing: 6,
  },
  metaBlock: { fontSize: 8, color: COLORS.gray, marginLeft: "auto" },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    minWidth: 120,
    marginBottom: 2,
  },
  metaLabel: { color: COLORS.gray },
  metaValue: { color: COLORS.black, textAlign: "right" },

  // 顧客（左）+ 店舗（右）
  partiesRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  partiesLeft: { width: "50%" },
  partiesRight: { width: "48%", alignItems: "flex-end" },
  customerName: {
    fontSize: 13,
    paddingBottom: 2,
    borderBottomWidth: 0.6,
    borderBottomColor: COLORS.black,
  },
  customerHonor: { fontSize: 11, marginTop: 2 },
  lead: { fontSize: 8, color: COLORS.gray, marginTop: 6 },

  shopName: {
    fontSize: 11,
    fontWeight: "bold",
    textAlign: "right",
    marginBottom: 2,
  },
  shopLine: { fontSize: 8, textAlign: "right", marginBottom: 1 },
  // 印鑑: 25mm × 25mm。会社情報の下、右寄せ（partiesRight 自体が alignItems: flex-end）。
  // flexShrink: 0 で行内の他要素から潰されないようにする。
  stampWrap: {
    marginTop: 6,
    alignItems: "flex-end",
  },
  stamp: {
    width: 25 * 2.83465,
    height: 25 * 2.83465,
    flexShrink: 0,
  },

  // 車両情報
  vehicleBox: {
    marginTop: 14,
    borderWidth: 0.5,
    borderColor: COLORS.tableLine,
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 8,
    paddingRight: 8,
  },
  vehicleHeading: {
    fontSize: 8,
    fontWeight: "bold",
    color: COLORS.gray,
    letterSpacing: 1,
    marginBottom: 4,
  },
  vehicleGrid: { flexDirection: "row", flexWrap: "wrap" },
  vehicleCell: {
    width: "50%",
    flexDirection: "row",
    paddingVertical: 1,
  },
  vehicleLabel: { width: 70, color: COLORS.gray, fontSize: 8 },
  vehicleValue: { fontSize: 9, flex: 1 },

  // 明細
  categoryHeading: {
    fontSize: 9,
    fontWeight: "bold",
    paddingVertical: 3,
    borderBottomWidth: 1.2,
    borderBottomColor: COLORS.black,
    marginTop: 12,
    marginBottom: 0,
  },
  tableHeadRow: {
    flexDirection: "row",
    borderBottomWidth: 1.2,
    borderBottomColor: COLORS.black,
    paddingVertical: 3,
    fontSize: 8,
    fontWeight: "bold",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.4,
    borderBottomColor: COLORS.tableLine,
    paddingVertical: 3,
    fontSize: 9,
  },
  // 5 列構成: 品名 / 数量 / 工賃 / 部品代 / 小計
  // 利用可能幅 180mm を以下で割り振る（合計 100%）。
  colName: { width: "52%", paddingRight: 4 },
  colQty: { width: "9%", textAlign: "right", paddingRight: 4 },
  colLabor: { width: "13%", textAlign: "right", paddingRight: 4 },
  colParts: { width: "13%", textAlign: "right", paddingRight: 4 },
  colSubtotal: { width: "13%", textAlign: "right" },
  // 工賃+部品代の結合（単価表示）
  colUnit: { width: "26%", textAlign: "right", paddingRight: 4 },
  emptyMessage: {
    textAlign: "center",
    color: COLORS.gray,
    fontSize: 9,
    paddingVertical: 12,
    borderTopWidth: 1.2,
    borderBottomWidth: 1.2,
    borderColor: COLORS.black,
    marginTop: 12,
  },

  // 合計
  totalsWrap: {
    width: "45%",
    marginLeft: "auto",
    marginTop: 14,
    fontSize: 9,
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
    paddingHorizontal: 2,
  },
  totalsRowDivider: {
    borderTopWidth: 0.5,
    borderTopColor: COLORS.black,
  },
  totalsRowEmphasize: {
    borderTopWidth: 1.2,
    borderBottomWidth: 1.2,
    borderColor: COLORS.black,
    fontWeight: "bold",
    fontSize: 11,
  },

  // 振込先
  paymentBox: {
    marginTop: 16,
    borderWidth: 0.5,
    borderColor: COLORS.tableLine,
    padding: 8,
  },
  paymentHeading: {
    fontSize: 8,
    fontWeight: "bold",
    color: COLORS.gray,
    letterSpacing: 1,
    marginBottom: 4,
  },
  paymentRow: {
    flexDirection: "row",
    fontSize: 9,
    paddingVertical: 1,
  },
  paymentLabel: { width: 80, color: COLORS.gray },
  paymentValue: { flex: 1 },
  paymentDue: { marginTop: 8, fontSize: 9, color: COLORS.gray },
  paymentDueValue: { fontWeight: "bold", color: COLORS.black },

  // 備考
  notesBox: {
    marginTop: 18,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.tableLine,
    paddingTop: 8,
  },
  notesHeading: { fontSize: 9, fontWeight: "bold", marginBottom: 4 },
  notesBody: { fontSize: 9 },
});

function categorize(it: OrderItem): "maintenance" | "shakenTaxable" | "shakenTaxFree" {
  if (it.type === "shaken") return it.tax_free ? "shakenTaxFree" : "shakenTaxable";
  return "maintenance";
}

function hasBankInfo(b: BankInfo | undefined): b is BankInfo {
  if (!b) return false;
  return [b.bank_name, b.branch_name, b.account_number, b.account_holder].some(
    (v) => v.trim() !== "",
  );
}

function formatDateJP(s: string): string {
  const [y, m, d] = s.split("-");
  return `${y}年${Number.parseInt(m, 10)}月${Number.parseInt(d, 10)}日`;
}

interface ItemsSectionProps {
  title: string;
  items: OrderItem[];
}

function ItemsSection({ title, items }: ItemsSectionProps) {
  return (
    <View>
      <Text style={styles.categoryHeading}>【{title}】</Text>
      <View style={styles.tableHeadRow}>
        <Text style={styles.colName}>品名</Text>
        <Text style={styles.colQty}>数量</Text>
        <Text style={styles.colLabor}>工賃</Text>
        <Text style={styles.colParts}>部品代</Text>
        <Text style={styles.colSubtotal}>小計</Text>
      </View>
      {items.map((it, i) => {
        const showBreakdown = it.labor_cost != null || it.parts_cost != null;
        return (
          <View
            key={`${title}-${i}`}
            style={styles.tableRow}
            wrap={false}
          >
            <Text style={styles.colName}>{it.name}</Text>
            <Text style={styles.colQty}>{it.quantity}</Text>
            {showBreakdown ? (
              <>
                <Text style={styles.colLabor}>
                  {it.labor_cost != null ? formatYen(it.labor_cost) : "—"}
                </Text>
                <Text style={styles.colParts}>
                  {it.parts_cost != null ? formatYen(it.parts_cost) : "—"}
                </Text>
              </>
            ) : (
              <Text style={styles.colUnit}>{formatYen(it.unit_price ?? 0)}</Text>
            )}
            <Text style={styles.colSubtotal}>{formatYen(rowSubtotal(it))}</Text>
          </View>
        );
      })}
    </View>
  );
}

interface TotalsRowProps {
  label: string;
  value: string;
  divider?: boolean;
  emphasize?: boolean;
}

function TotalsRow({ label, value, divider, emphasize }: TotalsRowProps) {
  return (
    <View
      style={{
        ...styles.totalsRow,
        ...(divider ? styles.totalsRowDivider : {}),
        ...(emphasize ? styles.totalsRowEmphasize : {}),
      }}
      wrap={false}
    >
      <Text>{label}</Text>
      <Text>{value}</Text>
    </View>
  );
}

export function InvoiceDocument({
  documentType,
  order,
  customer,
  vehicle,
  shop,
  logoBuffer,
  stampBuffer,
}: InvoiceDocumentProps) {
  const allItems = order.items ?? [];
  const totals = calculateTotals(
    allItems,
    order.discount_amount,
    order.deposit_amount,
  );

  const title = documentType === "estimate" ? "見積書" : "請求書";
  const lead =
    documentType === "estimate"
      ? "下記の通りお見積申し上げます。"
      : "下記の通りご請求申し上げます。";
  const today = new Date().toISOString().slice(0, 10);

  const maintenanceItems = allItems.filter(
    (i) => categorize(i) === "maintenance",
  );
  const shakenTaxableItems = allItems.filter(
    (i) => categorize(i) === "shakenTaxable",
  );
  const shakenTaxFreeItems = allItems.filter(
    (i) => categorize(i) === "shakenTaxFree",
  );

  const bank = shop.bank_info;
  const showBank = documentType === "invoice" && hasBankInfo(bank);
  const showDue = documentType === "invoice" && !!order.payment_due_date;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* 透かし: 全ページ */}
        {logoBuffer && (
          <Image src={logoBuffer} style={styles.watermark} fixed />
        )}

        {/* 2ページ目以降のヘッダー */}
        <View
          style={styles.continuationOuter}
          fixed
          render={({ pageNumber }) =>
            pageNumber > 1 ? (
              <View style={styles.continuationInner}>
                <Text style={styles.continuationTitle}>{title}</Text>
                <Text style={styles.continuationCenter}>
                  {order.id}  {customer?.name ?? "—"} 様
                </Text>
                <Text
                  style={styles.continuationRight}
                  render={({ pageNumber: pn, totalPages }) =>
                    `${pn} / ${totalPages}`
                  }
                />
              </View>
            ) : null
          }
        />

        {/* 1ページ目: タイトル + 文書情報 */}
        <View style={styles.headerRow}>
          <Text style={styles.titleCenter}>{title}</Text>
          <View style={styles.metaBlock}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>管理No.</Text>
              <Text style={styles.metaValue}>{order.id}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>発行日</Text>
              <Text style={styles.metaValue}>{formatDate(today)}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>受付日</Text>
              <Text style={styles.metaValue}>
                {formatDate(order.reception_date)}
              </Text>
            </View>
          </View>
        </View>

        {/* 顧客 + 店舗 */}
        <View style={styles.partiesRow}>
          <View style={styles.partiesLeft}>
            <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
              <Text style={styles.customerName}>{customer?.name ?? "—"}</Text>
              <Text style={styles.customerHonor}> 様</Text>
            </View>
            <Text style={styles.lead}>{lead}</Text>
          </View>
          <View style={styles.partiesRight}>
            <Text style={styles.shopName}>
              {shop.shop_name || "（店舗名 未設定）"}
            </Text>
            {shop.address ? (
              <Text style={styles.shopLine}>{shop.address}</Text>
            ) : null}
            {shop.phone ? (
              <Text style={styles.shopLine}>TEL: {shop.phone}</Text>
            ) : null}
            {shop.registration_no ? (
              <Text style={styles.shopLine}>
                登録番号: {shop.registration_no}
              </Text>
            ) : null}
            {stampBuffer ? (
              <View style={styles.stampWrap}>
                <Image src={stampBuffer} style={styles.stamp} />
              </View>
            ) : null}
          </View>
        </View>

        {/* 車両情報 */}
        <View style={styles.vehicleBox}>
          <Text style={styles.vehicleHeading}>車両情報</Text>
          <View style={styles.vehicleGrid}>
            <View style={styles.vehicleCell}>
              <Text style={styles.vehicleLabel}>ナンバー</Text>
              <Text style={styles.vehicleValue}>
                {vehicle?.plate_number ?? "—"}
              </Text>
            </View>
            <View style={styles.vehicleCell}>
              <Text style={styles.vehicleLabel}>メーカー / 車種</Text>
              <Text style={styles.vehicleValue}>
                {`${vehicle?.maker ?? "—"} / ${vehicle?.model ?? "—"}`}
              </Text>
            </View>
            <View style={styles.vehicleCell}>
              <Text style={styles.vehicleLabel}>年式</Text>
              <Text style={styles.vehicleValue}>
                {vehicle?.model_year ? `${vehicle.model_year}年` : "—"}
              </Text>
            </View>
            <View style={styles.vehicleCell}>
              <Text style={styles.vehicleLabel}>車台番号</Text>
              <Text style={styles.vehicleValue}>{vehicle?.vin ?? "—"}</Text>
            </View>
          </View>
        </View>

        {/* 明細 */}
        {allItems.length === 0 ? (
          <Text style={styles.emptyMessage}>明細がありません。</Text>
        ) : (
          <>
            {maintenanceItems.length > 0 && (
              <ItemsSection title="整備費用" items={maintenanceItems} />
            )}
            {shakenTaxableItems.length > 0 && (
              <ItemsSection title="車検費用（課税）" items={shakenTaxableItems} />
            )}
            {shakenTaxFreeItems.length > 0 && (
              <ItemsSection
                title="車検費用（非課税）"
                items={shakenTaxFreeItems}
              />
            )}
          </>
        )}

        {/* 合計 */}
        <View style={styles.totalsWrap}>
          {totals.sections.normal.subtotal > 0 && (
            <TotalsRow
              label="整備小計"
              value={formatYen(totals.sections.normal.subtotal)}
            />
          )}
          {totals.sections.shakenTaxable.subtotal > 0 && (
            <TotalsRow
              label="車検課税小計"
              value={formatYen(totals.sections.shakenTaxable.subtotal)}
            />
          )}
          {totals.sections.shakenTaxFree.subtotal > 0 && (
            <TotalsRow
              label="車検非課税小計"
              value={formatYen(totals.sections.shakenTaxFree.subtotal)}
            />
          )}
          {totals.discount > 0 && (
            <TotalsRow
              label="値引き"
              value={`− ${formatYen(totals.discount)}`}
              divider
            />
          )}
          <TotalsRow
            label="課税対象額"
            value={formatYen(totals.taxableAmount)}
            divider
          />
          <TotalsRow label="消費税(10%)" value={formatYen(totals.tax)} />
          <TotalsRow
            label="合計"
            value={formatYen(totals.total)}
            emphasize
          />
          {totals.deposit > 0 && (
            <>
              <TotalsRow
                label="預かり金"
                value={`− ${formatYen(totals.deposit)}`}
              />
              <TotalsRow
                label="差引請求額"
                value={formatYen(totals.balance)}
                emphasize
              />
            </>
          )}
        </View>

        {/* お振込先 */}
        {showBank && bank ? (
          <View style={styles.paymentBox} wrap={false}>
            <Text style={styles.paymentHeading}>お振込先</Text>
            {(() => {
              const bankAndBranch = [bank.bank_name, bank.branch_name]
                .filter((s) => s.trim() !== "")
                .join(" ");
              const accountLine = [bank.account_type, bank.account_number]
                .filter((s) => s.trim() !== "")
                .join(" ");
              return (
                <>
                  {bankAndBranch ? (
                    <View style={styles.paymentRow}>
                      <Text style={styles.paymentLabel}>銀行・支店</Text>
                      <Text style={styles.paymentValue}>{bankAndBranch}</Text>
                    </View>
                  ) : null}
                  {accountLine ? (
                    <View style={styles.paymentRow}>
                      <Text style={styles.paymentLabel}>種別 / 番号</Text>
                      <Text style={styles.paymentValue}>{accountLine}</Text>
                    </View>
                  ) : null}
                  {bank.account_holder.trim() !== "" ? (
                    <View style={styles.paymentRow}>
                      <Text style={styles.paymentLabel}>名義</Text>
                      <Text style={styles.paymentValue}>
                        {bank.account_holder}
                      </Text>
                    </View>
                  ) : null}
                </>
              );
            })()}
          </View>
        ) : null}

        {/* 振込期限 */}
        {showDue && order.payment_due_date ? (
          <Text style={styles.paymentDue}>
            お振込期限:{" "}
            <Text style={styles.paymentDueValue}>
              {formatDateJP(order.payment_due_date)}
            </Text>
          </Text>
        ) : null}

        {/* 備考 */}
        {order.notes && order.notes.trim() !== "" ? (
          <View style={styles.notesBox}>
            <Text style={styles.notesHeading}>備考</Text>
            <Text style={styles.notesBody}>{order.notes}</Text>
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
