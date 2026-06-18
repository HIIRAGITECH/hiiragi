import type { Metadata } from "next";
import { loadMypageByToken } from "@/lib/mypage/load";
import MypageView from "./mypage-view";

// トークン付き個人ページのため検索インデックス対象外にする。
export const metadata: Metadata = {
  title: "作業状況のご確認 | HIIRAGI",
  robots: { index: false, follow: false },
};

// お客様マイページ（段階3）。ログイン不要・閲覧のみのサーバーコンポーネント。
// 「誰に見せるか（loadMypageByToken）」と「何を見せるか（MypageView）」を分離している。
// 将来ログイン方式へ移行する場合は loadMypageByToken を差し替えるだけでよい。
export default async function MypagePage(
  props: PageProps<"/mypage/[token]">,
) {
  const { token } = await props.params;
  const result = await loadMypageByToken(token);

  if (result.status === "not_found") {
    return (
      <StatusScreen
        title="ページが見つかりません"
        message="URLが正しいかご確認ください。お心当たりがない場合は、お手数ですがお店までお問い合わせください。"
      />
    );
  }

  if (result.status === "expired") {
    return (
      <StatusScreen
        title="このリンクは有効期限が切れています"
        message="お手数ですが、お店までお問い合わせください。"
      />
    );
  }

  return (
    <div className="min-h-full" style={{ background: "var(--color-cream)" }}>
      <MypageView view={result.view} />
    </div>
  );
}

function StatusScreen({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div
      className="flex min-h-full items-center justify-center px-4 py-16"
      style={{ background: "var(--color-cream)" }}
    >
      <div className="w-full max-w-sm rounded-xl border bg-[var(--color-paper)] p-8 text-center shadow-sm" style={{ borderColor: "var(--color-line)" }}>
        <h1 className="text-base font-semibold text-[var(--color-ink)]">
          {title}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--color-ink-mid)]">
          {message}
        </p>
      </div>
    </div>
  );
}
