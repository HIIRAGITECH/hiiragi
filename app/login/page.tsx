import type { Metadata } from "next";
import Link from "next/link";
import LoginForm from "./login-form";

export const metadata: Metadata = {
  title: "ログイン | HIIRAGI",
};

const flashes: Record<string, { kind: "success" | "error"; text: string }> = {
  "signup=pending": {
    kind: "success",
    text: "確認メールを送信しました。メール内のリンクをクリックして登録を完了してください。",
  },
  "reset=sent": {
    kind: "success",
    text: "パスワードリセット用のメールを送信しました。受信箱をご確認ください。",
  },
  "password=updated": {
    kind: "success",
    text: "パスワードを更新しました。新しいパスワードでログインしてください。",
  },
  "error=auth_callback_failed": {
    kind: "error",
    text: "認証リンクの処理に失敗しました。もう一度お試しください。",
  },
  "error=missing_code": {
    kind: "error",
    text: "認証情報が見つかりません。リンクをもう一度開いてください。",
  },
};

function pickFlash(sp: Record<string, string | string[] | undefined>) {
  for (const [key, value] of Object.entries(flashes)) {
    const [k, v] = key.split("=");
    if (sp[k] === v) return value;
  }
  return null;
}

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = (await props.searchParams) ?? {};
  const flash = pickFlash(sp);

  return (
    <div className="flex flex-1 items-center justify-center bg-[var(--color-cream)] px-4 py-12">
      <div className="w-full max-w-md bg-[var(--color-paper)] border border-[var(--color-line-strong)] p-10">
        <div className="mb-8 text-center">
          <h1
            className="text-2xl font-bold tracking-widest text-[var(--color-ink)]"
            style={{ letterSpacing: "0.2em" }}
          >
            HIIRAGI <span className="text-[var(--color-accent)]">TECH</span>
          </h1>
          <p className="mt-2 text-xs text-[var(--color-ink-light)] tracking-widest">
            工房管理システム
          </p>
        </div>

        {flash && (
          <p
            role={flash.kind === "error" ? "alert" : "status"}
            className={flash.kind === "success" ? "wos-alert info mb-4" : "wos-alert warn mb-4"}
          >
            {flash.text}
          </p>
        )}

        <LoginForm />

        <div className="mt-6 space-y-2 text-center text-xs text-[var(--color-ink-light)]">
          <p>
            <Link
              href="/reset-password"
              className="text-[var(--color-accent)] hover:underline"
            >
              パスワードを忘れた方はこちら
            </Link>
          </p>
          <p>
            アカウントをお持ちでない方は{" "}
            <Link
              href="/signup"
              className="text-[var(--color-accent)] hover:underline"
            >
              新規登録
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
