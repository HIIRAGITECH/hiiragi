import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Customer, Vehicle } from "@/lib/types";
import DeleteButton from "@/lib/components/delete-button";
import { deleteCustomer, deleteVehicle } from "../actions";
import HistoryTab from "./history-tab";

export const metadata: Metadata = {
  title: "顧客詳細 | HIIRAGI",
};

type TabKey = "info" | "history";

export default async function CustomerDetailPage(
  props: PageProps<"/dashboard/customers/[id]">,
) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const tab: TabKey = sp?.tab === "history" ? "history" : "info";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: customerData } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .eq("user_id", user!.id)
    .maybeSingle();

  if (!customerData) notFound();
  const customer = customerData as Customer;

  return (
    <>
      <div className="wos-pagehead">
        <div className="min-w-0 flex-1">
          <div className="wos-crumbs">
            <Link href="/dashboard/customers" className="hover:underline">
              顧客管理
            </Link>{" "}
            ／ 顧客詳細
          </div>
          <h1>{customer.name} 様</h1>
          <div className="wos-gloss">
            <span className="wos-serif-num">{customer.id.slice(0, 8)}</span>
            {customer.name_kana && (
              <span className="ml-3 text-[var(--color-ink-light)]">
                {customer.name_kana}
              </span>
            )}
          </div>
        </div>
        <div className="wos-actions">
          <Link
            href={`/dashboard/customers/${customer.id}/edit`}
            className="wos-btn-ghost wos-btn-sm"
          >
            編集
          </Link>
          <DeleteButton
            action={deleteCustomer}
            hidden={{ id: customer.id }}
            confirmMessage={`顧客「${customer.name}」を削除します。紐づく車両もすべて削除されます。よろしいですか？`}
            label="削除"
            className="wos-btn-danger wos-btn-sm"
          />
        </div>
      </div>

      <TabNav active={tab} customerId={customer.id} />

      <div className="flex-1 overflow-auto bg-[var(--color-cream)]">
        <div className="px-8 py-6">
          {tab === "history" ? (
            <HistoryTab customerId={customer.id} userId={user!.id} />
          ) : (
            <InfoTab customer={customer} userId={user!.id} />
          )}
        </div>
      </div>
    </>
  );
}

function TabNav({
  active,
  customerId,
}: {
  active: TabKey;
  customerId: string;
}) {
  const base =
    "px-5 py-3 text-sm font-medium tracking-wider transition-colors border-b-2 -mb-px";
  const activeCls =
    "border-[var(--color-accent)] text-[var(--color-ink)]";
  const inactiveCls =
    "border-transparent text-[var(--color-ink-mid)] hover:text-[var(--color-ink)]";

  return (
    <nav className="flex border-b border-[var(--color-line)] bg-[var(--color-paper)] px-8">
      <Link
        href={`/dashboard/customers/${customerId}`}
        className={`${base} ${active === "info" ? activeCls : inactiveCls}`}
      >
        基本情報
      </Link>
      <Link
        href={`/dashboard/customers/${customerId}?tab=history`}
        className={`${base} ${active === "history" ? activeCls : inactiveCls}`}
      >
        整備履歴
      </Link>
    </nav>
  );
}

async function InfoTab({
  customer,
  userId,
}: {
  customer: Customer;
  userId: string;
}) {
  const supabase = await createClient();
  const { data: vehicleData } = await supabase
    .from("vehicles")
    .select("*")
    .eq("customer_id", customer.id)
    .eq("user_id", userId)
    .order("id", { ascending: true });

  const vehicles = (vehicleData ?? []) as Vehicle[];

  return (
    <div className="flex flex-col gap-8">
      <section className="wos-card">
        <div className="wos-sec-label mb-4">基本情報</div>
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <Field label="氏名" value={customer.name} />
          <Field label="フリガナ" value={customer.name_kana} />
          <Field label="電話番号" value={customer.phone} num />
          <Field label="メールアドレス" value={customer.email} />
          <Field label="郵便番号" value={customer.postal_code} num />
          <Field
            label="住所"
            value={customer.address}
            className="sm:col-span-2"
          />
          <Field
            label="メモ"
            value={customer.notes}
            className="sm:col-span-2"
            multiline
          />
        </dl>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="wos-sec-label">
            保有車両<span className="wos-ct">{vehicles.length}台</span>
          </div>
          <Link
            href={`/dashboard/customers/${customer.id}/vehicles/new`}
            className="wos-btn wos-btn-sm"
          >
            ＋ 車両を追加
          </Link>
        </div>

        {vehicles.length === 0 ? (
          <div className="wos-card text-center py-10 text-sm text-[var(--color-ink-light)]">
            登録されている車両はありません。
          </div>
        ) : (
          <table className="w-full border-collapse bg-[var(--color-paper)] border border-[var(--color-line)]">
            <thead>
              <tr className="border-b-2 border-[var(--color-line-strong)] bg-[var(--color-cream)]">
                <th className="wos-th">ナンバー</th>
                <th className="wos-th">メーカー</th>
                <th className="wos-th">車種</th>
                <th className="wos-th">年式</th>
                <th className="wos-th right">操作</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => (
                <tr
                  key={v.id}
                  className="border-b border-[var(--color-line)]"
                >
                  <td className="wos-td font-semibold text-[var(--color-ink)]">
                    {v.plate_number ?? "—"}
                  </td>
                  <td className="wos-td muted">{v.maker ?? "—"}</td>
                  <td className="wos-td">{v.model ?? "—"}</td>
                  <td className="wos-td num">{v.model_year ?? "—"}</td>
                  <td className="wos-td right">
                    <div className="inline-flex gap-2">
                      <Link
                        href={`/dashboard/customers/${customer.id}/vehicles/${v.id}/edit`}
                        className="wos-btn-ghost wos-btn-xs"
                      >
                        編集
                      </Link>
                      <DeleteButton
                        action={deleteVehicle}
                        hidden={{
                          customer_id: customer.id,
                          vehicle_id: v.id,
                        }}
                        confirmMessage={`車両「${v.plate_number ?? v.id}」を削除します。よろしいですか？`}
                        label="削除"
                        className="wos-btn-danger wos-btn-xs"
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  className,
  multiline,
  num,
}: {
  label: string;
  value: string | null;
  className?: string;
  multiline?: boolean;
  num?: boolean;
}) {
  return (
    <div className={className}>
      <dt
        className="text-xs font-medium text-[var(--color-ink-mid)]"
        style={{ letterSpacing: "0.12em" }}
      >
        {label}
      </dt>
      <dd
        className={`mt-1 text-sm text-[var(--color-ink)] ${multiline ? "whitespace-pre-wrap" : ""}`}
        style={{
          fontFamily: num ? "var(--font-num)" : undefined,
          fontVariantNumeric: num ? "tabular-nums" : undefined,
        }}
      >
        {value ?? "—"}
      </dd>
    </div>
  );
}
