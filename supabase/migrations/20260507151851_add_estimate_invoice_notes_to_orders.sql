-- 見積書備考 / 請求書備考を独立カラムとして orders に追加する。
--
-- 既存の notes（入荷時メモ）は受注一覧画面でのみ表示する用途で残す。
-- 見積書 PDF / プレビューには estimate_notes、請求書 PDF / プレビューには
-- invoice_notes を使う。null の場合は備考セクションを非表示にする。
--
-- 本番 DB 適用は手動で実行する（Supabase ダッシュボード or CLI）。
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS estimate_notes text,
  ADD COLUMN IF NOT EXISTS invoice_notes  text;
