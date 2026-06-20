import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/dashboard/actions";
import { createClient } from "@/lib/supabase/server";
import { evaluateAccess } from "@/lib/subscription";
import type { Subscription } from "@/lib/types";

export const metadata: Metadata = {
  title: "ご利用の再開について | HIIRAGI",
};

// 課金ロック画面。middleware が有効でない契約のユーザーをここへ誘導する。
// ダッシュボードのシェル（サイドバー等）を継承しない独立画面。
export default async function LockedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("subscriptions")
    .select("plan, status, trial_ends_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const sub = data as Pick<
    Subscription,
    "plan" | "status" | "trial_ends_at"
  > | null;

  // 念のため：有効ならダッシュボードへ戻す（middleware と同じ判定。直リンク対策）。
  const { locked } = evaluateAccess(sub, Date.now());
  if (!locked) redirect("/dashboard");

  // トライアル終了 / 利用停止 で文面を出し分け。
  const isTrialEnded = sub?.plan === "trial";
  const heading = isTrialEnded
    ? "無料トライアルが終了しました"
    : "ご利用が停止されています";
  const lead = isTrialEnded
    ? "無料トライアル期間が終了しました。引き続きご利用いただくには、プランへのお申し込みが必要です。"
    : "現在ご利用が停止されています。お支払い状況をご確認のうえ、プランの再開手続きをお願いいたします。";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-cream)] px-4 py-12">
      <div className="w-full max-w-md rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)] p-8 shadow-sm">
        <div className="mb-2 text-xs font-semibold tracking-[0.12em] text-[var(--color-accent)]">
          HIIRAGI
        </div>
        <h1 className="text-lg font-semibold text-[var(--color-ink)]">
          {heading}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-mid)]">
          {lead}
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <Link
            href="/dashboard/billing"
            className="inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold text-white"
            style={{ background: "var(--color-accent)" }}
          >
            プランを確認・申し込む
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="w-full rounded-lg border border-[var(--color-line-strong)] px-4 py-2.5 text-sm text-[var(--color-ink)]"
            >
              ログアウト
            </button>
          </form>
        </div>

        <div className="mt-6 border-t border-[var(--color-line)] pt-4 text-xs leading-relaxed text-[var(--color-ink-light)]">
          ご不明な点は{" "}
          <a
            href="mailto:info@hiiragi-tech.app"
            className="underline underline-offset-2 text-[var(--color-ink-mid)]"
          >
            info@hiiragi-tech.app
          </a>{" "}
          までお問い合わせください。
        </div>
      </div>
    </main>
  );
}
