-- 部品画像の Storage バケット `part-images` を作り、ポリシーを張る。
--
-- 設計判断 (DECISIONS.md 2026-09-09 参照):
--   - **非公開バケット(public=false)**。表示は署名付きURLを都度発行する。
--     EC公開時に「画像が公開URLで置いてある」状態にしておくと、同じ経路で原価を含む社内情報まで
--     漏らす作りに引きずられやすい。公開が必要になった時点で **公開用の別経路**
--     (公開ミラーバケット or 署名を発行する専用ルート)を足す前提にする。
--   - ポリシーは既存の `shop-assets` バケットと**完全に同じ形**に揃える:
--     先頭フォルダ = auth.uid() の自分のオブジェクトだけ CRUD できる。
--     パス形式は `<user_id>/<part_id>/<uuid>.<ext>`。
--   - MIME は jpeg / webp / png のみ。クライアント側でリサイズ・圧縮してから上げるので
--     サイズ上限は 3MB あれば十分な余裕がある(原寸のまま上げさせない)。
--
-- 注意: storage.objects へのポリシー作成は所有者権限が要る。
--       本番へは Supabase ダッシュボードの SQL Editor(postgres ロール)で実行すること。
--       (バケットだけ Dashboard の Storage 画面から作り、ポリシーだけここで流してもよい。)

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'part-images',
  'part-images',
  false,
  3145728,                                              -- 3MB
  ARRAY['image/jpeg', 'image/webp', 'image/png']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS part_images_select_own ON storage.objects;
CREATE POLICY part_images_select_own ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'part-images'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

DROP POLICY IF EXISTS part_images_insert_own ON storage.objects;
CREATE POLICY part_images_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'part-images'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

DROP POLICY IF EXISTS part_images_update_own ON storage.objects;
CREATE POLICY part_images_update_own ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'part-images'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'part-images'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

DROP POLICY IF EXISTS part_images_delete_own ON storage.objects;
CREATE POLICY part_images_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'part-images'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

COMMIT;
