import type {
  BankInfo,
  Customer,
  Order,
  OrderItem,
  ShopInfo,
  Vehicle,
} from "@/lib/types";
import { calculateTotals, rowSubtotal } from "@/lib/orders/totals";
import { formatDate, formatYen } from "@/lib/format";

function hasBankInfo(b: BankInfo | undefined): b is BankInfo {
  if (!b) return false;
  return [b.bank_name, b.branch_name, b.account_number, b.account_holder].some(
    (v) => v.trim() !== "",
  );
}

// YYYY-MM-DD → 「YYYY年M月D日」
function formatDateJP(s: string): string {
  const [y, m, d] = s.split("-");
  return `${y}年${Number.parseInt(m, 10)}月${Number.parseInt(d, 10)}日`;
}

type Props = {
  type: "estimate" | "invoice";
  order: Order;
  customer: Customer | null;
  vehicle: Vehicle | null;
  shop: ShopInfo;
  // logoUrl は PDF 側で透かしとして使うが HTML プレビューでは描画しないため受け取らない。
  // 既存呼び出し側との後方互換のため Props 型には残すが、引数で destructure はしない。
  logoUrl?: string | null;
  stampUrl: string | null;
};

export default function PrintableDocument({
  type,
  order,
  customer,
  vehicle,
  shop,
  stampUrl,
}: Props) {
  const allItems = order.items ?? [];
  const totals = calculateTotals(
    allItems,
    order.discount_amount,
    order.deposit_amount,
  );
  const normalItems = allItems.filter((i) => i.type !== "shaken");
  const shakenTaxableItems = allItems.filter(
    (i) => i.type === "shaken" && !i.tax_free,
  );
  const shakenTaxFreeItems = allItems.filter(
    (i) => i.type === "shaken" && i.tax_free === true,
  );
  const title = type === "estimate" ? "見積書" : "請求書";
  const today = new Date().toISOString().slice(0, 10);

  return (
    <article
      className="printable mx-auto max-w-[800px] bg-white p-10 text-sm text-black shadow-sm print:max-w-none print:p-0 print:shadow-none"
      // PDF (lib/pdf-react/InvoiceDocument) と同じ IPAex Gothic を使い、未ロード時は
      // system 日本語フォントにフォールバック。preview と PDF の見た目を揃える狙い。
      style={{
        fontFamily:
          '"IPAex Gothic", "Yu Gothic", "Hiragino Kaku Gothic ProN", "Noto Sans JP", system-ui, sans-serif',
      }}
    >
      <h1 className="mb-8 text-center text-3xl font-bold tracking-[0.5em]">
        {title}
      </h1>

      <div className="mb-8 grid grid-cols-2 gap-8">
        <div>
          <p className="mb-2 text-base">
            <span className="border-b border-black px-4 pb-1 text-lg font-medium">
              {customer?.name ?? "—"}
            </span>
            <span className="ml-2">様</span>
          </p>
          {/* 顧客の郵便番号・住所・電話番号がデータにあれば顧客名直下に積む。
              null/空はその行ごと省略する。PDF 側 (InvoiceDocument) の partiesLeft と表示順を揃える。 */}
          {customer?.postal_code && (
            <p className="text-xs">〒{customer.postal_code}</p>
          )}
          {customer?.address && (
            <p className="text-xs">{customer.address}</p>
          )}
          {customer?.phone && (
            <p className="text-xs">TEL: {customer.phone}</p>
          )}
          <p className="mt-6 text-xs text-zinc-700">
            {type === "estimate"
              ? "下記の通りお見積申し上げます。"
              : "下記の通りご請求申し上げます。"}
          </p>
        </div>
        <div className="text-right">
          <dl className="mb-3 inline-block text-left text-xs">
            <Row label="管理No." value={order.id} mono />
            <Row label="発行日" value={formatDate(today)} />
            <Row label="受付日" value={formatDate(order.reception_date)} />
          </dl>
          <div className="mt-3 border-t border-black pt-2 text-xs">
            <p className="text-base font-semibold">
              {shop.shop_name || "（店舗名 未設定）"}
            </p>
            {shop.address && <p>{shop.address}</p>}
            {shop.phone && <p>TEL: {shop.phone}</p>}
            {shop.registration_no && (
              <p>登録番号: {shop.registration_no}</p>
            )}
            {/* 電子印鑑: 会社情報の下、右寄せ。20mm × 20mm 相当（≒ 75px）。
                透過 PNG は会社情報と重ならず単独配置でも自然に見える。 */}
            {stampUrl && (
              <div className="mt-2 flex justify-end">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={stampUrl}
                  alt=""
                  aria-hidden
                  className="h-[75px] w-[75px] select-none object-contain"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 請求/見積金額: 車両情報ボックスの直前に独立行で大きく表示。
          PDF 側 (InvoiceDocument の amountHeadline) と揃える。
          請求書 + 預かり金あり (deposit > 0) の場合は差引請求額を、
          それ以外は税込合計を採用。 */}
      <p className="mb-2 mt-3 text-base font-bold">
        {type === "estimate" ? "御見積金額" : "ご請求金額"}:{" "}
        {formatYen(
          type === "invoice" && totals.deposit > 0
            ? totals.balance
            : totals.total,
        )}
      </p>

      {/* 車両情報 */}
      <section className="mb-6 rounded border border-zinc-300 p-3 text-xs">
        <h2 className="mb-1 text-[11px] font-semibold tracking-widest text-zinc-600">
          車両情報
        </h2>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
          <Row label="ナンバー" value={vehicle?.plate_number ?? "—"} />
          <Row
            label="メーカー / 車種"
            value={`${vehicle?.maker ?? "—"} / ${vehicle?.model ?? "—"}`}
          />
          <Row
            label="年式"
            value={vehicle?.model_year ? `${vehicle.model_year}年` : "—"}
          />
          <Row label="車台番号" value={vehicle?.vin ?? "—"} />
        </div>
      </section>

      {/* 明細（セクション別）*/}
      {allItems.length === 0 ? (
        <div className="mb-6 border-y-2 border-black px-2 py-6 text-center text-xs text-zinc-500">
          明細がありません。
        </div>
      ) : (
        <>
          {normalItems.length > 0 && (
            <ItemsSection
              title="整備費用"
              items={normalItems}
              showBreakdown
            />
          )}
          {shakenTaxableItems.length > 0 && (
            <ItemsSection
              title="車検費用（課税）"
              items={shakenTaxableItems}
              showBreakdown
            />
          )}
          {shakenTaxFreeItems.length > 0 && (
            <ItemsSection
              title="車検費用（非課税）"
              items={shakenTaxFreeItems}
              showBreakdown={false}
            />
          )}
        </>
      )}

      {/* 合計 */}
      <div className="mb-6 ml-auto w-72 text-xs">
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
      </div>

      {type === "invoice" && hasBankInfo(shop.bank_info) && (
        <section
          className="mb-6 rounded border border-zinc-300 p-3 text-xs"
          style={{ pageBreakInside: "avoid" }}
        >
          <h2 className="mb-2 text-[11px] font-semibold tracking-widest text-zinc-600">
            お振込先
          </h2>
          <BankInfoRows bank={shop.bank_info} />
        </section>
      )}

      {type === "invoice" && order.payment_due_date && (
        <section
          className="mb-6 text-xs"
          style={{ pageBreakInside: "avoid" }}
        >
          <p className="text-zinc-700">
            お振込期限:{" "}
            <span className="font-semibold text-zinc-900">
              {formatDateJP(order.payment_due_date)}
            </span>
          </p>
        </section>
      )}

      {/* 備考: 見積書は estimate_notes、請求書は invoice_notes を参照する。
          order.notes（入荷時メモ）は社内向けなので帳票には出さない。 */}
      {(() => {
        const noteText =
          type === "estimate" ? order.estimate_notes : order.invoice_notes;
        if (!noteText || noteText.trim() === "") return null;
        return (
          <section
            className="mt-8 border-t border-zinc-300 pt-3 text-xs"
            style={{ pageBreakInside: "avoid" }}
          >
            <h2 className="mb-1 font-semibold">備考</h2>
            <p className="whitespace-pre-wrap">{noteText}</p>
          </section>
        );
      })()}
    </article>
  );
}

function BankInfoRows({ bank }: { bank: BankInfo }) {
  const bankAndBranch = [bank.bank_name, bank.branch_name]
    .filter((s) => s.trim() !== "")
    .join(" ");
  const accountLine = [bank.account_type, bank.account_number]
    .filter((s) => s.trim() !== "")
    .join(" ");

  return (
    <dl className="grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1">
      {bankAndBranch && (
        <>
          <dt className="text-zinc-600">銀行・支店</dt>
          <dd>{bankAndBranch}</dd>
        </>
      )}
      {accountLine && (
        <>
          <dt className="text-zinc-600">種別 / 番号</dt>
          <dd className="font-mono">{accountLine}</dd>
        </>
      )}
      {bank.account_holder.trim() !== "" && (
        <>
          <dt className="text-zinc-600">名義</dt>
          <dd>{bank.account_holder}</dd>
        </>
      )}
    </dl>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-24 shrink-0 text-zinc-600">{label}</dt>
      <dd className={mono ? "font-mono" : undefined}>{value}</dd>
    </div>
  );
}

function ItemsSection({
  title,
  items,
  showBreakdown,
}: {
  title: string;
  items: OrderItem[];
  showBreakdown: boolean;
}) {
  return (
    <section className="mb-5">
      <h2 className="mb-0 break-after-avoid border-b-[1.2px] border-black pb-0.5 text-xs font-bold tracking-wide">
        【{title}】
      </h2>
      {/* 列幅は PDF (InvoiceDocument styles.colName/colQty/colLabor/colParts/colSubtotal) と同じ % 比率に揃える。
          colgroup で固定することで、長文品名でも他の列幅がブレない。 */}
      <table className="w-full table-fixed border-collapse text-xs">
        <colgroup>
          <col style={{ width: "52%" }} />
          <col style={{ width: "9%" }} />
          {showBreakdown ? (
            <>
              <col style={{ width: "13%" }} />
              <col style={{ width: "13%" }} />
            </>
          ) : (
            <col style={{ width: "26%" }} />
          )}
          <col style={{ width: "13%" }} />
        </colgroup>
        <thead>
          <tr className="border-b-[1.2px] border-black">
            <th className="px-2 py-1 text-left text-[10px]">品名</th>
            <th className="px-2 py-1 text-right text-[10px]">数量</th>
            {showBreakdown ? (
              <>
                <th className="px-2 py-1 text-right text-[10px]">工賃</th>
                <th className="px-2 py-1 text-right text-[10px]">部品代</th>
              </>
            ) : (
              <th className="px-2 py-1 text-right text-[10px]">単価</th>
            )}
            <th className="px-2 py-1 text-right text-[10px]">小計</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i} className="border-b border-zinc-500 align-top">
              <td className="px-2 py-1 break-words">{it.work_name}</td>
              <td className="px-2 py-1 text-right">{it.quantity}</td>
              {showBreakdown ? (
                <>
                  <td className="px-2 py-1 text-right">
                    {it.labor_cost !== undefined
                      ? formatYen(it.labor_cost)
                      : "—"}
                  </td>
                  <td className="px-2 py-1 text-right">
                    {it.parts_cost !== undefined
                      ? formatYen(it.parts_cost)
                      : "—"}
                  </td>
                </>
              ) : (
                <td className="px-2 py-1 text-right">
                  {formatYen(it.unit_price)}
                </td>
              )}
              <td className="px-2 py-1 text-right">
                {formatYen(rowSubtotal(it))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function TotalsRow({
  label,
  value,
  emphasize,
  divider,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  divider?: boolean;
}) {
  const className = emphasize
    ? "border-y-2 border-black text-base font-bold"
    : divider
      ? "border-t border-black"
      : "";
  return (
    <div className={`flex justify-between px-1 py-1 ${className}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
