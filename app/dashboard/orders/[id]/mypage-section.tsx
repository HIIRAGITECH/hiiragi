"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  issueMypageToken,
  regenerateMypageToken,
  revokeMypageToken,
} from "./mypage-actions";

type Props = {
  orderId: string;
  customerName: string | null;
  baseUrl: string;
  token: string | null;
  expiresAt: string | null;
  // 段階4: マイページ機能の使用権（管理者 or options.mypage）。
  // false のときは発行/再発行を出さず、アップセル導線を控えめに出す。
  enabled: boolean;
};

// 受注詳細の「お客様マイページ」セクション。
// 状態別に 未発行 / 発行済み（有効）/ 発行済み（期限切れ）を出し分ける。
// 課金連動（options.mypage）は Step 4 で入れるため、ここでは全ユーザーにボタンを表示する。
export default function MypageSection({
  orderId,
  customerName,
  baseUrl,
  token,
  expiresAt,
  enabled,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"url" | "template" | null>(null);

  // 期限切れ判定はクライアントの現在時刻に依存するため、SSR と client の差で
  // hydration mismatch が起きないようマウント後に評価する（マウント前は「有効」扱い）。
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
  }, []);

  const url = token ? `${baseUrl}/mypage/${token}` : null;
  const expired =
    now != null && expiresAt != null
      ? new Date(expiresAt).getTime() < now
      : false;

  const template =
    url != null
      ? `${customerName ?? "お客様"}様\n` +
        `作業状況をこちらのページでご確認いただけます。\n` +
        `${url}\n` +
        `（有効期限：${formatExpiry(expiresAt)}まで）`
      : "";

  async function copy(text: string, which: "url" | "template") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("コピーに失敗しました。お手数ですが手動でコピーしてください。");
    }
  }

  async function handleIssue() {
    setBusy(true);
    setError(null);
    const res = await issueMypageToken(orderId);
    setBusy(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  async function handleRegenerate() {
    if (
      !confirm(
        "新しいURLを発行します。これまでのURLは無効になります（お客様に再度ご案内が必要です）。よろしいですか？",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    const res = await regenerateMypageToken(orderId);
    setBusy(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  async function handleRevoke() {
    if (
      !confirm(
        "このマイページURLを無効化します。お客様はページを開けなくなります。よろしいですか？",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    const res = await revokeMypageToken(orderId);
    setBusy(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <section className="wos-card">
      <div className="wos-sec-label mb-3">お客様マイページ</div>

      {token == null ? (
        enabled ? (
          <>
            <p className="text-sm text-[var(--color-ink-mid)] mb-4">
              お客様が作業状況を確認できるマイページURLを発行します。発行から45日間有効です。
            </p>
            <button
              type="button"
              onClick={handleIssue}
              disabled={busy}
              className="wos-btn wos-btn-sm"
            >
              {busy ? "発行中…" : "マイページURLを発行"}
            </button>
          </>
        ) : (
          <UpsellNote />
        )
      ) : (
        <div className="flex flex-col gap-4">
          {/* 状態バッジ + 有効期限 */}
          <div className="flex flex-wrap items-center gap-3">
            {expired ? (
              <span
                className="text-xs font-semibold tracking-[0.08em]"
                style={{ color: "var(--color-warn)" }}
              >
                ⚠️ 期限切れ
              </span>
            ) : (
              <span
                className="text-xs font-semibold tracking-[0.08em]"
                style={{ color: "var(--color-accent)" }}
              >
                発行済み
              </span>
            )}
            <span className="text-xs text-[var(--color-ink-mid)]">
              有効期限：{formatExpiry(expiresAt)} まで
            </span>
          </div>

          {expired && (
            <p className="wos-alert warn text-sm">
              このURLは有効期限が切れています。お客様に再度ご案内する場合は「再発行」してください。
            </p>
          )}

          {/* URL 表示 */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold tracking-[0.16em] text-[var(--color-ink-light)]">
              マイページURL
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <code className="wos-num flex-1 min-w-0 break-all rounded bg-[var(--color-cream)] px-3 py-2 text-xs text-[var(--color-ink)]">
                {url}
              </code>
              <button
                type="button"
                onClick={() => url && copy(url, "url")}
                disabled={busy}
                className="wos-btn-ghost wos-btn-sm shrink-0"
              >
                {copied === "url" ? "コピーしました" : "URLをコピー"}
              </button>
            </div>
          </div>

          {/* お客様向け文面テンプレ */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold tracking-[0.16em] text-[var(--color-ink-light)]">
              お客様向け文面（コピーしてLINE・メール等に貼り付け）
            </span>
            <pre className="whitespace-pre-wrap rounded bg-[var(--color-cream)] px-3 py-2 text-xs text-[var(--color-ink-soft)] font-sans">
              {template}
            </pre>
            <button
              type="button"
              onClick={() => copy(template, "template")}
              disabled={busy}
              className="wos-btn-ghost wos-btn-sm self-start"
            >
              {copied === "template" ? "コピーしました" : "文面をコピー"}
            </button>
          </div>

          {/* 操作 */}
          <div className="wos-hair" />
          <div className="flex flex-wrap gap-2">
            {/* 再発行も「発行」操作なので使用権が必要。無効化は常に可能。 */}
            {enabled && (
              <button
                type="button"
                onClick={handleRegenerate}
                disabled={busy}
                className="wos-btn-ghost wos-btn-sm"
              >
                再発行（古いURLを無効化）
              </button>
            )}
            <button
              type="button"
              onClick={handleRevoke}
              disabled={busy}
              className="wos-btn-danger wos-btn-sm"
            >
              無効化
            </button>
          </div>
          {!enabled && (
            <p className="text-xs text-[var(--color-ink-light)]">
              ※ マイページはオプション機能が無効のため、再発行はできません（既存URLは期限まで有効）。
            </p>
          )}
        </div>
      )}

      {error && <p className="wos-alert warn mt-3 text-sm">{error}</p>}
    </section>
  );
}

// 使用権がないとき（管理者でなく options.mypage も無効）に出すアップセル導線。
// うるさくならない程度に、案内文＋プラン管理リンクのみ。
function UpsellNote() {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-[var(--color-ink-mid)]">
        お客様マイページはオプション機能です。お客様が作業状況・お見積り・お支払いをスマホで確認できるURLを発行できます。
      </p>
      <Link
        href="/dashboard/billing"
        className="text-xs text-[var(--color-accent)] underline-offset-2 hover:underline self-start"
      >
        プラン管理で有効にする →
      </Link>
    </div>
  );
}

// ISO timestamptz を YYYY/MM/DD で表示する。クライアント側でだけ評価して
// SSR/CSR のロケール差による mismatch を避ける（呼び出しは client component 内のみ）。
function formatExpiry(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}/${m}/${day}`;
  } catch {
    return iso;
  }
}
