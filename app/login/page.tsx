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
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-zinc-950">
      <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            HIIRAGI
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            自動車整備工場 業務管理システム
          </p>
        </div>

        {flash && (
          <p
            role={flash.kind === "error" ? "alert" : "status"}
            className={`mb-4 rounded-md px-3 py-2 text-sm ${
              flash.kind === "success"
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
            }`}
          >
            {flash.text}
          </p>
        )}

        <LoginForm />

        <div className="mt-6 space-y-2 text-center text-sm text-zinc-500 dark:text-zinc-400">
          <p>
            <Link
              href="/reset-password"
              className="text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-50"
            >
              パスワードを忘れた方はこちら
            </Link>
          </p>
          <p>
            アカウントをお持ちでない方は{" "}
            <Link
              href="/signup"
              className="text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-50"
            >
              新規登録
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
