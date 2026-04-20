import type { Customer, Order, ShopInfo, Vehicle } from "@/lib/types";
import { calculateTotals, rowSubtotal } from "@/lib/orders/totals";
import { formatDate, formatYen } from "@/lib/format";

type Props = {
  type: "estimate" | "invoice";
  order: Order;
  customer: Customer | null;
  vehicle: Vehicle | null;
  shop: ShopInfo;
};

export default function PrintableDocument({
  type,
  order,
  customer,
  vehicle,
  shop,
}: Props) {
  const totals = calculateTotals(
    order.items ?? [],
    order.discount_amount,
    order.deposit_amount,
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

      {/* 明細 */}
      <table className="mb-6 w-full border-collapse text-xs">
        <thead>
          <tr className="border-y-2 border-black">
            <th className="px-2 py-1.5 text-left">品名</th>
            <th className="w-20 px-2 py-1.5 text-right">数量</th>
            <th className="w-28 px-2 py-1.5 text-right">単価</th>
            <th className="w-32 px-2 py-1.5 text-right">小計</th>
          </tr>
        </thead>
        <tbody>
          {(order.items ?? []).length === 0 ? (
            <tr>
              <td
                colSpan={4}
                className="px-2 py-6 text-center text-zinc-500"
              >
                明細がありません。
              </td>
            </tr>
          ) : (
            (order.items ?? []).map((it, i) => (
              <tr key={i} className="border-b border-zinc-300">
                <td className="px-2 py-1.5">{it.name}</td>
                <td className="px-2 py-1.5 text-right">{it.quantity}</td>
                <td className="px-2 py-1.5 text-right">
                  {formatYen(it.unit_price)}
                </td>
                <td className="px-2 py-1.5 text-right">
                  {formatYen(rowSubtotal(it))}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* 合計 */}
      <div className="mb-6 ml-auto w-72 text-xs">
        <TotalsRow label="小計" value={formatYen(totals.subtotal)} />
        {totals.discount > 0 && (
          <TotalsRow
            label="値引き"
            value={`− ${formatYen(totals.discount)}`}
          />
        )}
        <TotalsRow
          label="課税対象額"
          value={formatYen(totals.taxableAmount)}
        />
        <TotalsRow label="消費税(10%)" value={formatYen(totals.tax)} />
        <TotalsRow
          label="合計"
          value={formatYen(totals.total)}
          emphasize
        />
        {(type === "invoice" || totals.deposit > 0) && totals.deposit > 0 && (
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

      {order.notes && (
        <section className="mt-8 border-t border-zinc-300 pt-3 text-xs">
          <h2 className="mb-1 font-semibold">備考</h2>
          <p className="whitespace-pre-wrap">{order.notes}</p>
        </section>
      )}
    </article>
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

function TotalsRow({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={`flex justify-between border-b border-zinc-300 px-1 py-1 ${emphasize ? "border-y-2 border-black text-base font-bold" : ""}`}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
