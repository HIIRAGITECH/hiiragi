"use client";

import { useFormStatus } from "react-dom";
import { createCheckoutSession } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="wos-btn wos-btn-sm">
      {pending ? "Stripe に遷移中…" : "プランに申し込む"}
    </button>
  );
}

// 基本プランの申し込みフォーム。マイページオプションは別 subscription で管理するため
// ここには含めない（契約後にプラン管理画面のオプションセクションから追加する）。
export default function BillingForm() {
  return (
    <section className="wos-card space-y-4">
      <div className="wos-sec-label">プランに申し込む</div>
      <form action={createCheckoutSession} className="space-y-4">
        <div className="border border-[var(--color-line)] bg-[var(--color-paper)] p-3">
          <div className="flex items-baseline justify-between">
            <div className="text-sm font-medium">基本プラン</div>
            <div className="wos-yen text-base">
              月額 ¥1,980
              <span className="text-xs text-[var(--color-ink-light)] ml-1">
                税込
              </span>
            </div>
          </div>
          <div className="mt-1 text-xs text-[var(--color-ink-light)]">
            HIIRAGI 工房管理システムの全機能。お申し込みに必須です。
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-[var(--color-line)]">
          <div className="text-xs text-[var(--color-ink-mid)]">
            「申し込む」ボタンを押すと Stripe の決済ページへ遷移します。
          </div>
          <SubmitButton />
        </div>
      </form>
      <p className="text-xs text-[var(--color-ink-light)] pt-2 border-t border-[var(--color-line)]">
        お客様マイページオプション（月額 ¥980）は、申し込み後にこの画面から追加できます。
      </p>
    </section>
  );
}
