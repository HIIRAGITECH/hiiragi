-- 部品在庫 二階建て化（2026-06-24）。
-- 既存の各 parts_inventory（一階＝物理部品）に「汎用」バリアント（二階＝売り方・車種空）を
-- 1件ずつ生成し、価格・品番が消えないように移送する。
--
-- 移送マッピング:
--   一階 internal_code（社内品番） → 二階 part_number（お客様に見せる品番）
--   一階 sale_price（売価・廃止予定） → 二階 list_price（定価）
--   markup_rate は移送元が無いため null（掛率未設定）
--   vehicle_tags = '{}'（空 ＝ 汎用）
--
-- 設計上のポイント:
--   - 「汎用」は専用フラグを持たず「車種タグが空」で判定する（パターン②）。
--   - 既にバリアントを持つ部品でも、汎用（車種空）が無ければ補う。車種別バリアントはそのまま残す。
--   - display_order は既存バリアントの最小値 - 1 にして、汎用が常に先頭に並ぶようにする
--     （バリアントが無い部品は min が無いので 0 になる）。
--   - 一階の internal_code / sale_price 列は残す（ロールバック保険＋未移行行の表示フォールバック用）。
--     新しい登録経路ではこの2列に書き込まないが、列の DROP はしない。
--   - 新規カラム・新規テーブルが無いため GRANT 追加は不要
--     （authenticated ロールは既に parts_inventory_variants へ DML 可能）。
--
-- 冪等性: 既に汎用（車種空・未削除）を持つアクティブ部品は NOT EXISTS でスキップするため、
--         複数回流しても二重生成しない。

insert into public.parts_inventory_variants
  (user_id, part_id, part_number, list_price, vehicle_tags, markup_rate, display_order)
select
  p.user_id,
  p.id,
  p.internal_code,
  p.sale_price,
  '{}'::text[],
  null,
  coalesce(
    (select min(v.display_order)
       from public.parts_inventory_variants v
      where v.part_id = p.id
        and v.deleted_at is null),
    1
  ) - 1
from public.parts_inventory p
where p.deleted_at is null
  and not exists (
    select 1
      from public.parts_inventory_variants v
     where v.part_id = p.id
       and v.deleted_at is null
       and cardinality(v.vehicle_tags) = 0
  );
