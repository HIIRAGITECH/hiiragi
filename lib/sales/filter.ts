// 売上集計の「対象月」判定を PostgREST の or フィルタ文字列で表現する共通ヘルパー。
//
// 売上計上月（orders.sales_month, date, 月初1日）を優先し、未設定なら請求書発行日
// （invoiced_at, timestamptz）の月で集計する ＝ COALESCE(sales_month, invoiced_at の月)。
//
// supabase-js の .gte()/.lt() は単一カラムにしか掛けられず COALESCE 相当を直接書けないため、
// .or() で 2 枝に分ける:
//   1) sales_month が対象月 = 経営者が明示的にこの月へ割り当てた受注（invoiced_at が別月でも取り込む）
//   2) sales_month が null かつ invoiced_at が [start, end) = 従来どおり発行日の月で判定
// これにより「7/2 発行だが sales_month=6月」は 6 月集計に入り、7 月集計からは除外される（再割当が成立）。
//
// 使い方:
//   query.or(salesMonthOrFilter(monthFirst, start, end))
//   - 他の条件（.eq("user_id",…)/.in("invoice_status",…)）と併用すると PostgREST は AND 結合し、
//     or 部分は自動的に括られる。
//
// 引数:
//   monthFirst: 対象月の月初 'YYYY-MM-01'（sales_month と同じ date 形式）
//   start:      対象月の開始境界 ISO（例 '2026-07-01T00:00:00+09:00'）
//   end:        対象月の終了境界 ISO（翌月の開始・排他）
export function salesMonthOrFilter(
  monthFirst: string,
  start: string,
  end: string,
): string {
  return (
    `sales_month.eq.${monthFirst},` +
    `and(sales_month.is.null,invoiced_at.gte.${start},invoiced_at.lt.${end})`
  );
}
