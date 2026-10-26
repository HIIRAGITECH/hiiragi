// 売上集計の読み込み中スケルトン。
// 月切替（?year=&month=）は毎回サーバー再レンダリングを伴うため、以前は切替中に
// 前の画面のまま無反応に見えていた。loading.tsx を置くと Next.js が遷移の瞬間に
// このスケルトンへ即差し替える＝「押したら即反応」する体感になる（データ待ちは裏で進む）。
// 実データと同じコンテナ class（wos-pagehead / wos-card）を使い、骨格をずらさない。
// 配色は既存CSS変数のみ＝slate基調・ダークモード対応を維持。

function Bar({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-[var(--color-line)] ${className}`}
      aria-hidden
    />
  );
}

export default function SalesLoading() {
  return (
    <>
      {/* 月ヘッダー（前月／翌月ナビ） */}
      <div className="wos-pagehead">
        <div className="min-w-0 flex-1">
          <div className="wos-crumbs">会計 ／ 売上集計</div>
          <Bar className="mt-1 h-7 w-56" />
          <Bar className="mt-2 h-3 w-80 max-w-full" />
        </div>
        <div className="wos-actions">
          <Bar className="h-8 w-16" />
          <Bar className="h-8 w-16" />
          <Bar className="h-8 w-16" />
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[var(--color-cream)]">
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-8 py-6 flex flex-col gap-6">
          {/* ヒーロー：今月の売上 */}
          <section className="wos-card">
            <Bar className="h-3 w-40" />
            <Bar className="mt-3 h-10 w-52" />
            <Bar className="mt-3 h-3 w-64 max-w-full" />
            <div className="mt-4 flex flex-wrap gap-2">
              <Bar className="h-8 w-40" />
              <Bar className="h-8 w-40" />
            </div>
          </section>

          {/* 売上の内訳 */}
          <section className="wos-card flex flex-col gap-4">
            <Bar className="h-3 w-24" />
            <Bar className="h-3 w-full" />
            <div className="flex flex-col gap-2">
              <Bar className="h-4 w-full" />
              <Bar className="h-4 w-11/12" />
              <Bar className="h-4 w-10/12" />
            </div>
            <Bar className="mt-2 h-5 w-full" />
          </section>

          {/* 受注明細テーブル */}
          <section className="wos-card">
            <Bar className="h-3 w-28" />
            <div className="mt-4 flex flex-col gap-2.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <Bar key={i} className="h-5 w-full" />
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
