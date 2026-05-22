-- 部品マスターに品番（社内品番・社外品番）を追加（Step 5.5）。
-- どちらも任意（null 可）。既存行は null のまま動作する（後方互換）。
-- 本番 DB へは Supabase ダッシュボード or CLI から手動適用すること。

ALTER TABLE parts_inventory
  ADD COLUMN IF NOT EXISTS internal_code text,
  ADD COLUMN IF NOT EXISTS external_code text;
