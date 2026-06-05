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

export default function BillingForm({
  defaultMypage,
}: {
  defaultMypage: boolean;
}) {
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

        <label className="flex items-start gap-3 border border-[var(--color-line)] bg-[var(--color-paper)] p-3 cursor-pointer hover:border-[var(--color-line-strong)]">
          <input
            type="checkbox"
            name="add_mypage"
            defaultChecked={defaultMypage}
            className="mt-1"
          />
          <div className="flex-1">
            <div className="flex items-baseline justify-between">
              <div className="text-sm font-medium">マイページオプション</div>
              <div className="wos-yen text-base">
                月額 ¥980
                <span className="text-xs text-[var(--color-ink-light)] ml-1">
                  税込
                </span>
              </div>
            </div>
            <div className="mt-1 text-xs text-[var(--color-ink-light)]">
              顧客向けマイページ機能を有効化します。後からポータルでも追加・削除できます。
            </div>
          </div>
        </label>

        <div className="flex items-center justify-between pt-2 border-t border-[var(--color-line)]">
          <div className="text-xs text-[var(--color-ink-mid)]">
            「申し込む」ボタンを押すと Stripe の決済ページへ遷移します。
          </div>
          <SubmitButton />
        </div>
      </form>
    </section>
  );
}
