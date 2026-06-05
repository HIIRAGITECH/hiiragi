"use client";

import { useActionState, useEffect, useState } from "react";
import {
  SUBSCRIPTION_OPTION_KEYS,
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_STATUSES,
  type Subscription,
} from "@/lib/types";
import { updateSubscription, type UpdateSubscriptionState } from "./actions";

const PLAN_LABEL: Record<string, string> = {
  free: "Free（無料）",
  paid: "Paid（有料）",
  trial: "Trial（試用）",
  special_free: "Special Free（特別無料）",
};

const STATUS_LABEL: Record<string, string> = {
  active: "稼働中",
  suspended: "停止",
};

const OPTION_LABEL: Record<string, { title: string; desc: string }> = {
  mypage: { title: "マイページ", desc: "顧客向けマイページ機能" },
  line_notify: { title: "LINE通知", desc: "LINE 経由の顧客通知" },
  hp_integration: { title: "HP連携", desc: "ホームページからの予約連携" },
};

function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function EditForm({
  userId,
  email,
  subscription,
}: {
  userId: string;
  email: string;
  subscription: Subscription | null;
}) {
  const [state, formAction, pending] = useActionState<
    UpdateSubscriptionState,
    FormData
  >(updateSubscription, undefined);

  const initialPlan = subscription?.plan ?? "trial";
  const initialStatus = subscription?.status ?? "active";
  const initialOptions = subscription?.options ?? {};
  const initialMemo = subscription?.memo ?? "";
  const initialTrial = toDateInputValue(subscription?.trial_ends_at ?? null);

  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const success = state && "success" in state && state.success;
  const error = state && "error" in state ? state.error : undefined;

  return (
    <form action={formAction} className="wos-card space-y-6">
      <input type="hidden" name="user_id" value={userId} />

      <div>
        <div className="wos-sec-label">プラン</div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {SUBSCRIPTION_PLANS.map((p) => (
            <label
              key={p}
              className="flex items-center gap-2 border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2 text-sm hover:border-[var(--color-line-strong)] cursor-pointer"
            >
              <input
                type="radio"
                name="plan"
                value={p}
                defaultChecked={initialPlan === p}
                required
              />
              <span>{PLAN_LABEL[p]}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="trial_ends_at" className="wos-label">
          トライアル期限
        </label>
        <input
          id="trial_ends_at"
          name="trial_ends_at"
          type="date"
          defaultValue={initialTrial}
          className="wos-input max-w-xs"
        />
        <p className="mt-1 text-xs text-[var(--color-ink-light)]">
          試用プラン以外でも保存可。空欄で解除します。
        </p>
      </div>

      <div>
        <div className="wos-sec-label">ステータス</div>
        <div className="mt-3 flex gap-2">
          {SUBSCRIPTION_STATUSES.map((s) => (
            <label
              key={s}
              className="flex items-center gap-2 border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2 text-sm hover:border-[var(--color-line-strong)] cursor-pointer"
            >
              <input
                type="radio"
                name="status"
                value={s}
                defaultChecked={initialStatus === s}
                required
              />
              <span>{STATUS_LABEL[s]}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <div className="wos-sec-label">オプション機能</div>
        <div className="mt-3 space-y-2">
          {SUBSCRIPTION_OPTION_KEYS.map((k) => {
            const meta = OPTION_LABEL[k];
            return (
              <label
                key={k}
                className="flex items-start gap-3 border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2 cursor-pointer hover:border-[var(--color-line-strong)]"
              >
                <input
                  type="checkbox"
                  name={`opt_${k}`}
                  defaultChecked={initialOptions[k] === true}
                  className="mt-1"
                />
                <span className="flex-1">
                  <span className="block text-sm">{meta.title}</span>
                  <span className="block text-xs text-[var(--color-ink-light)]">
                    {meta.desc}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <div>
        <label htmlFor="memo" className="wos-label">
          社内メモ
        </label>
        <textarea
          id="memo"
          name="memo"
          rows={4}
          defaultValue={initialMemo}
          placeholder={`例: ${email} 経由で電話問い合わせあり`}
          className="wos-textarea"
        />
      </div>

      {error && (
        <p role="alert" className="wos-alert warn">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="wos-alert info">
          保存しました。
        </p>
      )}

      <div className="flex justify-between gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <button
          type="button"
          onClick={() => setToast("近日実装予定")}
          className="wos-btn-ghost wos-btn-sm"
        >
          代理ログイン
        </button>
        <button type="submit" disabled={pending} className="wos-btn wos-btn-sm">
          {pending ? "保存中…" : "保存する"}
        </button>
      </div>

      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 border border-[var(--color-line-strong)] bg-[var(--color-ink)] px-4 py-2 text-sm text-[var(--color-on-ink-fg)] shadow"
        >
          {toast}
        </div>
      )}
    </form>
  );
}
