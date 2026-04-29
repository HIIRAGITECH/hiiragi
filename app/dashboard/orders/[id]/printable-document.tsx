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

type Props = {
  type: "estimate" | "invoice";
  order: Order;
  customer: Customer | null;
  vehicle: Vehicle | null;
  shop: ShopInfo;
  logoUrl: string | null;
  stampUrl: string | null;
};

export default function PrintableDocument({
  type,
  order,
  customer,
  vehicle,
  shop,
  logoUrl,
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
    <article className="printable mx-auto max-w-[800px] bg-white p-10 text-sm text-black shadow-sm print:max-w-none print:p-0 print:shadow-none">
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
          <p className="mt-6 text-xs text-zinc-700">
            {type === "estimate"
              ? "下記の通りお見積申し上げます。"
              : "下記の通りご請求申し上げます。"}
          </p>
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={shop.shop_name || "店舗ロゴ"}
              className="mt-6 h-12 w-auto object-contain"
            />
          )}
        </div>
        <div className="text-right">
          <dl className="mb-3 inline-block text-left text-xs">
            <Row label="管理No." value={order.id} mono />
            <Row label="発行日" value={formatDate(today)} />
            <Row label="受付日" value={formatDate(order.reception_date)} />
          </dl>
          <div className="mt-3 border-t border-black pt-2 text-xs">
            <div className="relative inline-block">
              {/* 印鑑は背景に配置: DOM上で先に置き、会社名側に position:relative を付与することで会社名が前面に来る */}
              {stampUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={stampUrl}
                  alt=""
                  aria-hidden
                  className="pointer-events-none absolute right-0 top-1/2 h-16 w-16 -translate-y-1/2 translate-x-6 select-none"
                />
              )}
              <p className="relative text-base font-semibold">
                {shop.shop_name || "（店舗名 未設定）"}
              </p>
            </div>
            {shop.address && <p>{shop.address}</p>}
            {shop.phone && <p>TEL: {shop.phone}</p>}
            {shop.registration_no && (
              <p>登録番号: {shop.registration_no}</p>
            )}
          </div>
        </div>
      </div>

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

      {order.notes && (
        <section
          className="mt-8 border-t border-zinc-300 pt-3 text-xs"
          style={{ pageBreakInside: "avoid" }}
        >
          <h2 className="mb-1 font-semibold">備考</h2>
          <p className="whitespace-pre-wrap">{order.notes}</p>
        </section>
      )}
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
      <h2 className="mb-1 break-after-avoid border-b border-black pb-0.5 text-xs font-bold tracking-wide">
        【{title}】
      </h2>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b-2 border-black">
            <th className="px-2 py-1.5 text-left">品名</th>
            <th className="w-14 px-2 py-1.5 text-right">数量</th>
            {showBreakdown ? (
              <>
                <th className="w-24 px-2 py-1.5 text-right">工賃</th>
                <th className="w-24 px-2 py-1.5 text-right">部品代</th>
              </>
            ) : (
              <th className="w-28 px-2 py-1.5 text-right">単価</th>
            )}
            <th className="w-28 px-2 py-1.5 text-right">小計</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i} className="border-b border-zinc-300">
              <td className="px-2 py-1.5">{it.name}</td>
              <td className="px-2 py-1.5 text-right">{it.quantity}</td>
              {showBreakdown ? (
                <>
                  <td className="px-2 py-1.5 text-right">
                    {it.labor_cost !== undefined
                      ? formatYen(it.labor_cost)
                      : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {it.parts_cost !== undefined
                      ? formatYen(it.parts_cost)
                      : "—"}
                  </td>
                </>
              ) : (
                <td className="px-2 py-1.5 text-right">
                  {formatYen(it.unit_price)}
                </td>
              )}
              <td className="px-2 py-1.5 text-right">
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
