import { formatYen } from "@/lib/format";
import type { MypageOrder, MypageView } from "@/lib/mypage/load";

// お客様マイページ 表示コンポーネント（「何を見せるか」レイヤー）。
// 受け取るのはサニタイズ済みの MypageView のみ。原価・住所・電話・内部メモ等は
// 型の時点で存在しないため、ここから漏洩することはない。
//
// 表示は customer 軸（view.customer + view.orders）。現状 orders は 1 件だが、
// 将来ログイン化で複数 order になっても map でそのまま積み重ねられる構造にしておく。

export default function MypageView({ view }: { view: MypageView }) {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-6 flex flex-col gap-5">
      <ShopHeader view={view} />
      {view.orders.map((order) => (
        <OrderBlock key={order.id} order={order} />
      ))}
      <Footer view={view} />
    </main>
  );
}

function ShopHeader({ view }: { view: MypageView }) {
  const { shop, customer } = view;
  return (
    <header className="flex flex-col items-center gap-3 pt-4 pb-2 text-center">
      {shop.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={shop.logoUrl}
          alt={shop.shop_name || "店舗ロゴ"}
          className="h-16 w-auto object-contain"
        />
      ) : null}
      {shop.shop_name ? (
        <div className="text-lg font-semibold tracking-wide text-[var(--color-ink)]">
          {shop.shop_name}
        </div>
      ) : null}
      <div className="text-sm text-[var(--color-ink-mid)]">
        <span className="text-base font-semibold text-[var(--color-ink)]">
          {customer.name || "お客様"}
        </span>{" "}
        様
      </div>
    </header>
  );
}

function OrderBlock({ order }: { order: MypageOrder }) {
  return (
    <div className="flex flex-col gap-4">
      <VehicleCard order={order} />
      <EstimateSection order={order} />
      <WorkSection order={order} />
      <InvoiceSection order={order} />
      <PhotoSection order={order} />
    </div>
  );
}

function Card({
  title,
  accent,
  children,
}: {
  title?: string;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-xl border p-5 shadow-sm"
      style={{
        background: "var(--color-paper)",
        borderColor: accent ? "var(--color-accent)" : "var(--color-line)",
      }}
    >
      {title ? (
        <h2 className="mb-3 text-sm font-semibold tracking-[0.08em] text-[var(--color-accent)]">
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  );
}

function VehicleCard({ order }: { order: MypageOrder }) {
  const v = order.vehicle;
  const title =
    v && (v.maker || v.model)
      ? `${v.maker ?? ""} ${v.model ?? ""}`.trim()
      : "お車の情報";
  return (
    <Card>
      <div className="text-base font-semibold text-[var(--color-ink)]">
        {title}
      </div>
      {v ? (
        <div className="mt-1 text-sm text-[var(--color-ink-mid)]">
          {[
            v.model_year ? `${v.model_year}年` : null,
            v.color ? v.color : null,
          ]
            .filter(Boolean)
            .join(" ／ ") || "—"}
        </div>
      ) : null}
      <div className="mt-2 text-xs text-[var(--color-ink-light)]">
        受付日 {formatDateJST(order.reception_date)}
      </div>
    </Card>
  );
}

// 見積セクション: 発行済 / 了承済 のとき表示。
function EstimateSection({ order }: { order: MypageOrder }) {
  const show =
    order.estimate_status === "発行済" || order.estimate_status === "了承済";
  if (!show) return null;
  return (
    <Card title="お見積り" accent>
      <p className="mb-3 text-sm text-[var(--color-ink-mid)]">
        {order.estimate_status === "了承済"
          ? "ご承認ありがとうございます。下記内容で作業を進めてまいります。"
          : "お見積りをご確認ください。"}
      </p>
      <ItemList items={order.items} />
      <TotalsBlock order={order} mode="estimate" />
    </Card>
  );
}

// 作業セクション: 作業中 / 完了 のとき表示。
function WorkSection({ order }: { order: MypageOrder }) {
  if (order.work_status === "作業中") {
    return (
      <Card title="作業状況">
        <p className="text-sm text-[var(--color-ink)]">
          ただいま作業を進めております。
        </p>
        {order.items.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-1.5">
            {order.items.map((it, i) => (
              <li
                key={i}
                className="text-sm text-[var(--color-ink-mid)] before:mr-2 before:content-['・']"
              >
                {it.work_name}
                {it.part_name ? `（${it.part_name}）` : ""}
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    );
  }
  if (order.work_status === "完了") {
    return (
      <Card title="作業完了" accent>
        <p className="mb-3 text-sm font-medium text-[var(--color-ink)]">
          ✅ 作業が完了しました。ありがとうございました。
        </p>
        <ItemList items={order.items} />
        <TotalsBlock order={order} mode="estimate" />
      </Card>
    );
  }
  return null;
}

// 請求セクション: 請求済 / 入金済 のとき表示。
function InvoiceSection({ order }: { order: MypageOrder }) {
  if (order.invoice_status === "入金済") {
    return (
      <Card title="お支払い">
        <p className="text-sm font-medium text-[var(--color-ink)]">
          お支払いを確認いたしました。ありがとうございました。
        </p>
        {order.paid_at ? (
          <p className="mt-2 text-xs text-[var(--color-ink-light)]">
            入金確認日 {formatTimestampJST(order.paid_at)}
          </p>
        ) : null}
      </Card>
    );
  }
  if (order.invoice_status === "請求済") {
    return (
      <Card title="お支払いのご案内" accent>
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-[var(--color-ink-mid)]">
            お支払い金額
          </span>
          <span className="text-xl font-semibold text-[var(--color-ink)]">
            {formatYen(order.totals.balance)}
          </span>
        </div>
        {order.payment_due_date ? (
          <p className="mt-2 text-sm text-[var(--color-ink)]">
            お振込期限：
            <span className="font-medium">
              {formatDateJST(order.payment_due_date)}
            </span>
          </p>
        ) : null}
        {order.invoice_notes ? (
          <p className="mt-3 whitespace-pre-wrap text-xs text-[var(--color-ink-mid)]">
            {order.invoice_notes}
          </p>
        ) : null}
        <p className="mt-3 text-xs text-[var(--color-ink-light)]">
          お振込先はページ下部に記載しております。
        </p>
      </Card>
    );
  }
  return null;
}

function PhotoSection({ order }: { order: MypageOrder }) {
  if (!order.photo_folder_url) return null;
  // 作業中・完了のときに作業写真リンクを出す（受付段階では出さない）。
  if (order.work_status !== "作業中" && order.work_status !== "完了") {
    return null;
  }
  return (
    <Card title="作業写真">
      <p className="mb-3 text-sm text-[var(--color-ink-mid)]">
        作業の様子を写真でご覧いただけます。
      </p>
      <a
        href={order.photo_folder_url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold text-white"
        style={{ background: "var(--color-accent)" }}
      >
        📷 作業写真を見る
      </a>
    </Card>
  );
}

function ItemList({ items }: { items: MypageOrder["items"] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--color-ink-light)]">
        明細はまだありません。
      </p>
    );
  }
  return (
    <ul className="divide-y" style={{ borderColor: "var(--color-line)" }}>
      {items.map((it, i) => (
        <li key={i} className="flex items-baseline justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <div className="text-sm text-[var(--color-ink)]">
              {it.work_name || it.part_name || "—"}
            </div>
            {it.part_name && it.work_name ? (
              <div className="text-xs text-[var(--color-ink-light)]">
                {it.part_name}
              </div>
            ) : null}
            {it.note ? (
              <div className="text-xs text-[var(--color-ink-light)]">
                {it.note}
              </div>
            ) : null}
            {it.quantity > 1 ? (
              <div className="text-xs text-[var(--color-ink-light)]">
                {it.quantity} × {formatYen(it.unit_price)}
              </div>
            ) : null}
          </div>
          <div className="shrink-0 text-sm font-medium text-[var(--color-ink)]">
            {formatYen(it.amount)}
          </div>
        </li>
      ))}
    </ul>
  );
}

function TotalsBlock({
  order,
  mode,
}: {
  order: MypageOrder;
  mode: "estimate" | "invoice";
}) {
  const t = order.totals;
  return (
    <div className="mt-4 flex flex-col gap-1.5 border-t pt-3 text-sm" style={{ borderColor: "var(--color-line)" }}>
      <Row label="小計" value={formatYen(t.subtotal)} />
      {t.discount > 0 ? (
        <Row label="値引き" value={`− ${formatYen(t.discount)}`} />
      ) : null}
      <Row label="消費税" value={formatYen(t.tax)} />
      <Row label="合計" value={formatYen(t.total)} strong />
      {t.deposit > 0 ? (
        <>
          <Row label="お預かり金" value={`− ${formatYen(t.deposit)}`} />
          <Row
            label={mode === "invoice" ? "お支払い金額" : "差引金額"}
            value={formatYen(t.balance)}
            strong
          />
        </>
      ) : null}
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span
        className={
          strong
            ? "font-semibold text-[var(--color-ink)]"
            : "text-[var(--color-ink-mid)]"
        }
      >
        {label}
      </span>
      <span
        className={
          strong
            ? "text-base font-semibold text-[var(--color-ink)]"
            : "text-[var(--color-ink)]"
        }
      >
        {value}
      </span>
    </div>
  );
}

function Footer({ view }: { view: MypageView }) {
  const { shop } = view;
  const bank = shop.bank_info;
  // 請求済みの order があれば振込先を出す（入金済のみ・見積のみなら出さない）。
  const showBank =
    bank != null &&
    view.orders.some((o) => o.invoice_status === "請求済");

  return (
    <footer className="mt-2 flex flex-col gap-3 border-t pt-5 pb-8 text-center text-xs text-[var(--color-ink-light)]" style={{ borderColor: "var(--color-line)" }}>
      {showBank && bank ? (
        <div className="mx-auto w-full max-w-sm rounded-lg border p-4 text-left" style={{ borderColor: "var(--color-line)" }}>
          <div className="mb-1 text-[var(--color-ink-mid)] font-semibold">
            お振込先
          </div>
          <div className="text-sm text-[var(--color-ink)]">
            {bank.bank_name} {bank.branch_name}
          </div>
          <div className="text-sm text-[var(--color-ink)]">
            {bank.account_type} {bank.account_number}
          </div>
          <div className="text-sm text-[var(--color-ink)]">
            {bank.account_holder}
          </div>
        </div>
      ) : null}
      <div className="flex flex-col gap-0.5">
        {shop.shop_name ? <div>{shop.shop_name}</div> : null}
        {shop.address ? <div>{shop.address}</div> : null}
        {shop.phone ? <div>TEL: {shop.phone}</div> : null}
      </div>
      <PrivacyNote />
    </footer>
  );
}

// エンドユーザー向けの控えめなプライバシー表示。フッター基調（text-xs / ink-light）に揃える。
function PrivacyNote() {
  return (
    <div className="mx-auto mt-4 w-full max-w-sm text-left leading-relaxed">
      <div className="mb-2 font-semibold text-[var(--color-ink-mid)]">
        このページについて
      </div>
      <ul className="flex flex-col gap-1.5">
        {[
          "表示されている情報は、ご依頼いただいた店舗が登録・管理しています。",
          "このページは、専用のリンク（URL）をお持ちの方のみご覧いただけます。リンクには有効期限があります。",
          "本ページは、HIIRAGI TECH株式会社が提供するバイク整備工場向け業務管理システム「HIIRAGI」により表示されています。",
        ].map((text, i) => (
          <li key={i} className="before:mr-1.5 before:content-['・']">
            {text}
          </li>
        ))}
        <li className="before:mr-1.5 before:content-['・']">
          お客様の個人情報の取扱いについては
          <a
            href="https://hiiragi-tech.app/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 text-[var(--color-ink-mid)]"
          >
            プライバシーポリシー
          </a>
          をご覧ください。
        </li>
        <li className="before:mr-1.5 before:content-['・']">
          表示内容に関するお問い合わせは、ご依頼いただいた店舗までお願いいたします。
        </li>
      </ul>
    </div>
  );
}

// 日付(YYYY-MM-DD)を YYYY/MM/DD で表示。
function formatDateJST(s: string | null): string {
  if (!s) return "—";
  return s.replace(/-/g, "/");
}

// timestamptz(ISO) を JST の YYYY/MM/DD で表示（サーバー描画でも JST 固定で安定）。
function formatTimestampJST(iso: string): string {
  try {
    const fmt = new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return fmt.format(new Date(iso)).replace(/-/g, "/");
  } catch {
    return iso;
  }
}
