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
import {
  calculateListPriceTotals,
  calculateTotals,
  rowSubtotal,
} from "@/lib/orders/totals";
import { groupItemsByCategory } from "@/lib/orders/sections";
import type {
  BankInfo,
  Customer,
  Order,
  OrderItem,
  ShopInfo,
  Vehicle,
  WorkItemCategory,
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
  // 業務カテゴリ一覧（display_order 昇順、削除済みも含む）。
  // 過去明細が削除済みカテゴリを参照していても表示できるよう全件渡す前提。
  allCategories: WorkItemCategory[];
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
    // 30mm: 上部に「継続ヘッダ (タイトル/ページ番号/顧客名)」と「2ページ目以降の列見出し」
    // を両方収めるため、従来 25mm から拡張した。
    paddingTop: 30 * 2.83465,
    paddingBottom: 15 * 2.83465,
    paddingLeft: 15 * 2.83465,
    paddingRight: 15 * 2.83465,
    fontFamily: "NotoSansJP",
    fontSize: 9,
    color: COLORS.black,
    lineHeight: 1.35,
  },
  // 透かし: 全ページの中央に薄く配置
  // 0.06 では視認性が低く、0.11 ではやや主張しすぎだったため 0.10 に微調整。
  watermark: {
    position: "absolute",
    top: "30%",
    left: "20%",
    width: "60%",
    opacity: 0.1,
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

  // 2ページ目以降の上部に繰り返し表示する「明細テーブルの列見出し」。
  //   continuation header (タイトル/ページ番号バー) の下に置く。1ページ目には描画しない
  //   (各 ItemsSection 内の tableHeadRow を二重表示しないため)。
  //   位置 top:20mm は paddingTop:30mm の中で「継続ヘッダ (約 12mm) + 余白 + 列見出し」が
  //   ちょうど収まるよう調整。
  continuationTableHeadOuter: {
    position: "absolute",
    top: 20 * 2.83465,
    left: 15 * 2.83465,
    right: 15 * 2.83465,
  },
  continuationTableHeadInner: {
    flexDirection: "row",
    borderBottomWidth: 1.2,
    borderBottomColor: COLORS.black,
    paddingVertical: 3,
    fontSize: 8,
    fontWeight: "bold",
    backgroundColor: "#fff",
  },

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
  // 顧客名の下に出す住所・電話番号などの細字行
  customerLine: { fontSize: 9, marginTop: 1, color: COLORS.black },
  // 件名（請求書のみ）: amountHeadline の直上に表示。
  // 控えめなサイズ + 黒字でラベルは灰色。
  invoiceSubject: {
    fontSize: 10,
    color: COLORS.black,
    marginTop: 12,
    marginBottom: 2,
  },
  invoiceSubjectLabel: {
    color: COLORS.gray,
  },
  // 車両情報ボックスの直前に独立行で表示する請求/見積金額。
  // 受け取った人が金額を一目で把握できるようにする。
  // 件名がある場合は invoiceSubject 側で上余白を取るので、ここでは marginTop を 4 に詰める。
  amountHeadline: {
    fontSize: 14,
    fontWeight: "bold",
    marginTop: 12,
    marginBottom: 4,
  },
  amountHeadlineCompact: {
    fontSize: 14,
    fontWeight: "bold",
    marginTop: 2,
    marginBottom: 4,
  },
  lead: { fontSize: 8, color: COLORS.gray, marginTop: 6 },

  shopName: {
    fontSize: 11,
    fontWeight: "bold",
    textAlign: "right",
    marginBottom: 2,
  },
  shopLine: { fontSize: 8, textAlign: "right", marginBottom: 1 },
  // 印鑑: 20mm × 20mm。会社情報の下、右寄せ（partiesRight 自体が alignItems: flex-end）。
  // flexShrink: 0 で行内の他要素から潰されないようにする。
  stampWrap: {
    marginTop: 6,
    alignItems: "flex-end",
  },
  stamp: {
    width: 20 * 2.83465,
    height: 20 * 2.83465,
    flexShrink: 0,
  },

  // 車両情報
  // 上余白は amountHeadline.marginBottom に任せ、ここでは追加マージンを置かない。
  vehicleBox: {
    marginTop: 0,
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
    // 品名セルが複数行になる行（部品名・補足あり）で、数値列を最上段（work_name の行）
    // に揃えるため flex-start を明示。
    alignItems: "flex-start",
    // 罫線が一部の行（特に複数行折り返しした行）で消えて見える事象があったため、
    // 線幅 0.4 → 0.7 に強める。色も table line 色だと薄くて anti-alias で
    // 飛びやすかったため、本文 black に寄せた COLORS.gray に変更する。
    // borderBottomStyle を明示すると Adobe Reader 等で安定して solid 線が出る。
    borderBottomWidth: 0.7,
    borderBottomStyle: "solid",
    borderBottomColor: COLORS.gray,
    paddingVertical: 3,
    fontSize: 9,
  },
  // 部品名: 作業内容の下にインデント表示。文字色・サイズは本文と同じ。
  itemPartName: {
    marginLeft: 12,
    marginTop: 1,
  },
  // 補足: 「※」付き、薄いグレー、本文より小さめ。
  itemNote: {
    marginLeft: 12,
    marginTop: 1,
    fontSize: 8,
    color: COLORS.gray,
  },
  // 業販対応 段2-2: 顧客区分で列構成を切替。
  //   個人 (4列): 品名 52% / 数量 9% / 単価 26% / 小計 13%
  //   法人 (5列): 品名 46% / 数量 8% / 単価 14% / 業販 16% / 参考定価 16%
  // 印刷用 HTML (app/dashboard/orders/[id]/printable-document.tsx) と必ず同じ % にする。
  colName: { width: "52%", paddingRight: 4 },
  colQty: { width: "9%", textAlign: "right", paddingRight: 4 },
  colUnit: { width: "26%", textAlign: "right", paddingRight: 4 },
  colSubtotal: { width: "13%", textAlign: "right" },
  // 法人モード用 (5列構成)
  colNameBiz: { width: "46%", paddingRight: 4 },
  colQtyBiz: { width: "8%", textAlign: "right", paddingRight: 4 },
  colUnitBiz: { width: "14%", textAlign: "right", paddingRight: 4 },
  colBulk: { width: "16%", textAlign: "right", paddingRight: 4 },
  // 参考定価は色を薄めにする (画面と同様)
  colListPrice: {
    width: "16%",
    textAlign: "right",
    color: COLORS.gray,
  },
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

// 制御文字（U+0000〜U+001F）を半角スペースに置換するサニタイザ。
// 経緯:
//   品名に TAB(0x09) が含まれる既存データがあり、IPAex Gothic / NotoSansJP
//   どちらでも U+0009 → glyph 0 (.notdef) にフォールバックしてしまうため、
//   Adobe Reader が CID 0 を環境依存のフォールバックグリフ（"&" 等）で描画し、
//   かつ .notdef の advanceWidth が広いため隣接グリフと重なって
//   「最初の 1 文字が消えたように見える」現象が発生していた。
//
//   ブラウザ内蔵 PDF ビューアでは .notdef を空白として描画するため見た目は問題ない。
//   このため気付きづらかったが、データ衛生の観点でも控除すべき。
//
//   連続する制御文字をまとめて 1 つの半角スペースに正規化する。
function sanitizeText(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/[\x00-\x1f]+/g, " ");
}

interface ItemsSectionProps {
  title: string;
  items: OrderItem[];
  // 業販対応 段2-2: 顧客区分で列構成を切替。
  //   個人 (false): 品名 / 数量 / 単価 / 小計 (4列)
  //   法人 (true):  品名 / 数量 / 単価 / 業販 / 参考定価 (5列)
  isBusiness: boolean;
}

function ItemsSection({ title, items, isBusiness }: ItemsSectionProps) {
  // 列スタイルを customer_type で切替 (印刷用 HTML と同じ % 比率)
  const colNameStyle = isBusiness ? styles.colNameBiz : styles.colName;
  const colQtyStyle = isBusiness ? styles.colQtyBiz : styles.colQty;
  const colUnitStyle = isBusiness ? styles.colUnitBiz : styles.colUnit;

  return (
    <View>
      <Text style={styles.categoryHeading}>【{title}】</Text>
      <View style={styles.tableHeadRow}>
        <Text style={colNameStyle}>品名</Text>
        <Text style={colQtyStyle}>数量</Text>
        <Text style={colUnitStyle}>単価</Text>
        {isBusiness ? (
          <>
            <Text style={styles.colBulk}>業販</Text>
            <Text style={styles.colListPrice}>参考定価</Text>
          </>
        ) : (
          <Text style={styles.colSubtotal}>小計</Text>
        )}
      </View>
      {items.map((it, i) => {
        const partName =
          it.part_name && it.part_name.trim() !== "" ? it.part_name : null;
        const note = it.note && it.note.trim() !== "" ? it.note : null;
        const subtotal = rowSubtotal(it);
        // 業販対応 段2-2: 参考定価 = list_price × quantity。未保存 (過去明細) は「—」。
        const lp = it.list_price ?? 0;
        const qty = it.quantity ?? 0;
        const refTotal = lp > 0 && qty > 0 ? Math.round(qty * lp) : null;
        return (
          <View
            key={`${title}-${i}`}
            style={styles.tableRow}
            wrap={false}
          >
            {/* 品名セル: work_name / part_name / note を縦に配置。 */}
            <View style={colNameStyle}>
              <Text>{sanitizeText(it.work_name)}</Text>
              {partName && (
                <Text style={styles.itemPartName}>
                  {sanitizeText(partName)}
                </Text>
              )}
              {note && (
                <Text style={styles.itemNote}>
                  ※{sanitizeText(note)}
                </Text>
              )}
            </View>
            <Text style={colQtyStyle}>{it.quantity}</Text>
            <Text style={colUnitStyle}>{formatYen(it.unit_price ?? 0)}</Text>
            {isBusiness ? (
              <>
                <Text style={styles.colBulk}>{formatYen(subtotal)}</Text>
                <Text style={styles.colListPrice}>
                  {refTotal !== null ? formatYen(refTotal) : "—"}
                </Text>
              </>
            ) : (
              <Text style={styles.colSubtotal}>{formatYen(subtotal)}</Text>
            )}
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
  allCategories,
}: InvoiceDocumentProps) {
  const allItems = order.items ?? [];
  const totals = calculateTotals(
    allItems,
    order.discount_amount,
    order.deposit_amount,
  );
  // 業務カテゴリ単位のセクション（display_order 順、orphan 末尾）。
  const sections = groupItemsByCategory(allItems, allCategories);
  // 集計表用の 2 区分小計（旧 calculateTotals の値を流用、math は変わらない）。
  const taxableSubtotalAll =
    totals.sections.normal.subtotal + totals.sections.shakenTaxable.subtotal;
  const shakenNonTaxSubtotal = totals.sections.shakenTaxFree.subtotal;
  // 業販対応 段2-2: 顧客が法人 (business) のとき、明細を「単価/業販/参考定価」3列で表示し、
  // 合計欄に「参考定価合計（税込）」を併記する。null/personal は従来通り (個人モード)。
  const isBusiness = customer?.customer_type === "business";
  const listPriceTotals = calculateListPriceTotals(allItems);

  const title = documentType === "estimate" ? "見積書" : "請求書";
  const lead =
    documentType === "estimate"
      ? "下記の通りお見積申し上げます。"
      : "下記の通りご請求申し上げます。";
  // 1ページ目上部に大きく出す金額。預かり金がある請求書では差引請求額、
  // それ以外は total（=税込合計）を採用する。
  const amountLabel =
    documentType === "estimate" ? "御見積金額" : "ご請求金額";
  const headlineAmount =
    documentType === "invoice" && totals.deposit > 0
      ? totals.balance
      : totals.total;
  const today = new Date().toISOString().slice(0, 10);

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

        {/* 2ページ目以降の明細列見出し (繰り返しヘッダ)。
            1ページ目には描画しない（各 ItemsSection 内の tableHeadRow と二重表示を避ける）。
            列構成・列幅は ItemsSection と完全に同じ (個人=4列 / 法人=5列)。 */}
        <View
          style={styles.continuationTableHeadOuter}
          fixed
          render={({ pageNumber }) =>
            pageNumber > 1 ? (
              <View style={styles.continuationTableHeadInner}>
                <Text style={isBusiness ? styles.colNameBiz : styles.colName}>
                  品名
                </Text>
                <Text style={isBusiness ? styles.colQtyBiz : styles.colQty}>
                  数量
                </Text>
                <Text style={isBusiness ? styles.colUnitBiz : styles.colUnit}>
                  単価
                </Text>
                {isBusiness ? (
                  <>
                    <Text style={styles.colBulk}>業販</Text>
                    <Text style={styles.colListPrice}>参考定価</Text>
                  </>
                ) : (
                  <Text style={styles.colSubtotal}>小計</Text>
                )}
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
            {customer?.postal_code ? (
              <Text style={styles.customerLine}>〒{customer.postal_code}</Text>
            ) : null}
            {customer?.address ? (
              <Text style={styles.customerLine}>{customer.address}</Text>
            ) : null}
            {customer?.phone ? (
              <Text style={styles.customerLine}>TEL: {customer.phone}</Text>
            ) : null}
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

        {/* 件名（請求書のみ）: ご請求金額の直上に表示。
            invoice_subject が null / 空文字なら出さない。見積書には出さない。 */}
        {documentType === "invoice" &&
        order.invoice_subject &&
        order.invoice_subject.trim() !== "" ? (
          <Text style={styles.invoiceSubject}>
            <Text style={styles.invoiceSubjectLabel}>件名: </Text>
            {sanitizeText(order.invoice_subject.trim())}
          </Text>
        ) : null}

        {/* ご請求金額: 車両情報ボックスの直前に独立行で表示。左寄せ・本文 14pt bold */}
        <Text
          style={
            documentType === "invoice" &&
            order.invoice_subject &&
            order.invoice_subject.trim() !== ""
              ? styles.amountHeadlineCompact
              : styles.amountHeadline
          }
        >
          {amountLabel}: {formatYen(headlineAmount)}
        </Text>

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

        {/* 明細: 業務カテゴリ単位で分割。display_order 昇順、orphan 末尾。 */}
        {allItems.length === 0 ? (
          <Text style={styles.emptyMessage}>明細がありません。</Text>
        ) : (
          <>
            {sections.map((s) => (
              <ItemsSection
                key={s.key}
                title={s.isDeleted ? `（削除済み）${s.name}` : s.name}
                items={s.items}
                isBusiness={isBusiness}
              />
            ))}
          </>
        )}

        {/* 合計: 税区分2分類でシンプルに集計 */}
        <View style={styles.totalsWrap}>
          {taxableSubtotalAll > 0 && (
            <TotalsRow
              label="整備等小計"
              value={formatYen(taxableSubtotalAll)}
            />
          )}
          {shakenNonTaxSubtotal > 0 && (
            <TotalsRow
              label="車検法定費用小計"
              value={formatYen(shakenNonTaxSubtotal)}
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
          {/* 業販対応 段2-2: 法人時のみ、参考定価の税込合計を併記。
              list_price が1行も保存されていない過去明細だけの受注では出さない。 */}
          {isBusiness && listPriceTotals.hasAny && (
            <TotalsRow
              label="参考定価合計（税込）"
              value={formatYen(listPriceTotals.total)}
            />
          )}
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

        {/* 備考: 見積書は estimate_notes、請求書は invoice_notes を参照する。
            order.notes（入荷時メモ）は社内向けなので帳票には出さない。 */}
        {(() => {
          const noteText =
            documentType === "estimate"
              ? order.estimate_notes
              : order.invoice_notes;
          if (!noteText || noteText.trim() === "") return null;
          return (
            <View style={styles.notesBox}>
              <Text style={styles.notesHeading}>備考</Text>
              <Text style={styles.notesBody}>{sanitizeText(noteText)}</Text>
            </View>
          );
        })()}
      </Page>
    </Document>
  );
}
