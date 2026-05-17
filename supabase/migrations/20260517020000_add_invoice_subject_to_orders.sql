-- 請求書の「件名（お題目）」を orders に追加する。
--
-- 用途:
--   請求書帳票・PDF の合計金額の上に「件名: 2026年4月分整備代金として」のように表示する。
--   未入力（NULL）の場合は何も表示しない。見積書には表示しない（請求書専用）。
--
-- 入力タイミング:
--   受注を「請求済」に変更する際の振込期限モーダルで、振込期限と一緒に任意入力する。
--   未請求に戻した場合は payment_due_date と同じく NULL にリセットする。
--
-- 本番 DB 適用は手動で実行する（Supabase ダッシュボード or CLI）。
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS invoice_subject text;
