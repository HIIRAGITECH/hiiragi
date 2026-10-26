// ダッシュボード（KPI）の読み込み中スケルトン。
// 売上集計と同じく、認証往復＋サーバー再レンダリングの待ち時間を無反応に見せないため、
// 遷移の瞬間に骨格を即表示する。実データと同じコンテナ class を使い、ずれを出さない。
// 配色は既存CSS変数のみ＝slate基調・ダークモード対応を維持。

function Bar({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-[var(--color-line)] ${className}`}
      aria-hidden
    />
  );
}

export default function DashboardLoading() {
  return (
    <>
      {/* ヘッダー */}
      <div className="wos-pagehead">
        <div className="min-w-0 flex-1">
          <Bar className="h-3 w-48" />
          <Bar className="mt-2 h-7 w-72 max-w-full" />
        </div>
        <div className="wos-actions">
          <Bar className="h-10 w-28" />
          <Bar className="h-8 w-20" />
          <Bar className="h-8 w-32" />
        </div>
      </div>

      {/* KPI 6連 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 border-b border-[var(--color-line)] bg-[var(--color-paper)]">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="px-5 py-4 flex flex-col gap-2"
            style={{
              borderRight:
                i < 5 ? "1px solid var(--color-line)" : "none",
            }}
          >
            <Bar className="h-3 w-20" />
            <Bar className="mt-1 h-7 w-24" />
            <Bar className="h-3 w-16" />
          </div>
        ))}
      </div>

      {/* 2ペイン: 要対応 / 未回収 */}
      <div className="flex-1 overflow-auto bg-[var(--color-cream)]">
        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-8 px-4 sm:px-8 py-6 min-h-full">
          {[0, 1].map((col) => (
            <div key={col} className="min-w-0 flex flex-col gap-3">
              <Bar className="h-3 w-32" />
              <div className="flex flex-col gap-3 pt-1">
                {Array.from({ length: col === 0 ? 5 : 4 }).map((_, i) => (
                  <Bar key={i} className="h-6 w-full" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
