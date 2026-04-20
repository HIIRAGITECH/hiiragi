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
      <div className="mb-6">
        <Link
          href="/dashboard/customers"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          ← 顧客一覧に戻る
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              {customer.name}
            </h2>
            <p className="mt-1 font-mono text-xs text-zinc-500 dark:text-zinc-400">
              {customer.id}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/dashboard/customers/${customer.id}/edit`}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              編集
            </Link>
            <DeleteButton
              action={deleteCustomer}
              hidden={{ id: customer.id }}
              confirmMessage={`顧客「${customer.name}」を削除します。紐づく車両もすべて削除されます。よろしいですか？`}
              label="削除"
            />
          </div>
        </div>
      </div>

      <TabNav active={tab} customerId={customer.id} />

      {tab === "history" ? (
        <HistoryTab customerId={customer.id} userId={user!.id} />
      ) : (
        <InfoTab customer={customer} userId={user!.id} />
      )}
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
  const baseClass =
    "px-1 pb-2 text-sm transition-colors border-b-2 -mb-px";
  const activeClass =
    "border-zinc-900 font-medium text-zinc-900 dark:border-zinc-50 dark:text-zinc-50";
  const inactiveClass =
    "border-transparent text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50";

  return (
    <nav className="flex gap-6 border-b border-zinc-200 dark:border-zinc-800">
      <Link
        href={`/dashboard/customers/${customerId}`}
        className={`${baseClass} ${active === "info" ? activeClass : inactiveClass}`}
      >
        基本情報
      </Link>
      <Link
        href={`/dashboard/customers/${customerId}?tab=history`}
        className={`${baseClass} ${active === "history" ? activeClass : inactiveClass}`}
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
    <>
      <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          基本情報
        </h3>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <Field label="フリガナ" value={customer.name_kana} />
          <Field label="電話番号" value={customer.phone} />
          <Field label="メールアドレス" value={customer.email} />
          <Field label="郵便番号" value={customer.postal_code} />
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

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            保有車両（{vehicles.length} 台）
          </h3>
          <Link
            href={`/dashboard/customers/${customer.id}/vehicles/new`}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            ＋ 車両を追加
          </Link>
        </div>

        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          {vehicles.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
              登録されている車両はありません。
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wider text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
                <tr>
                  <th className="px-4 py-3 font-medium">車両ID</th>
                  <th className="px-4 py-3 font-medium">ナンバー</th>
                  <th className="px-4 py-3 font-medium">メーカー</th>
                  <th className="px-4 py-3 font-medium">車種</th>
                  <th className="px-4 py-3 font-medium">年式</th>
                  <th className="px-4 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {vehicles.map((v) => (
                  <tr key={v.id}>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-700 dark:text-zinc-300">
                      {v.id}
                    </td>
                    <td className="px-4 py-3 text-zinc-900 dark:text-zinc-50">
                      {v.plate_number ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {v.maker ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {v.model ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {v.model_year ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-2">
                        <Link
                          href={`/dashboard/customers/${customer.id}/vehicles/${v.id}/edit`}
                          className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
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
                          className="rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs text-red-700 transition-colors hover:bg-red-50 dark:border-red-900 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950/30"
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}

function Field({
  label,
  value,
  className,
  multiline,
}: {
  label: string;
  value: string | null;
  className?: string;
  multiline?: boolean;
}) {
  return (
    <div className={className}>
      <dt className="text-xs text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd
        className={`mt-0.5 text-zinc-900 dark:text-zinc-100 ${multiline ? "whitespace-pre-wrap" : ""}`}
      >
        {value ?? "—"}
      </dd>
    </div>
  );
}
