-- 経営者判断の「売上計上月」を orders に追加する。
--
-- 背景:
--   売上集計は請求書発行日（invoiced_at）の月を基準にしているが、整備工場の実務では
--   「6月30日締めのつもりが、実際の請求書発行操作は7月2日になった」というケースが頻繁にある。
--   経営者としては「これは6月分の売上」として集計したいが、システムは invoiced_at の月＝7月に入れてしまう。
--   そこで「この受注を何月分の売上とするか」を経営者が上書きできる列を新設する。
--
-- 意味・使い方:
--   月初1日（YYYY-MM-01）を格納する。NULL なら従来どおり invoiced_at の月で集計する（後方互換）。
--   内部管理用・顧客非公開。マイページ・PDF には出さない（RPC / 型 / 描画コンポーネントに足さない）。
--   invoice_status を「未請求」に戻した場合は invoiced_at 等と同様に NULL にリセットする（アプリ側で実施）。
--
-- 集計は「請求済 / 入金済」かつ極小規模のため、専用インデックスは付けない（invoiced_at の既存 index で十分）。
-- カラム追加のみのため GRANT / RLS の追加は不要（既存 orders 権限を継承）。
--
-- 本番 DB 適用は手動で実行する（Supabase ダッシュボード or CLI）。
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS sales_month date;

COMMENT ON COLUMN orders.sales_month IS
  '経営者判断の売上計上月（月初1日を格納）。null なら invoiced_at の月で集計。内部管理用・顧客非公開。';
