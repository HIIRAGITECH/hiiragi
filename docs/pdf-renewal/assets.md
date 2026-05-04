# ロゴ・印鑑画像の取得方法（Supabase Storage）

## 保存先

- バケット: `shop-assets`（**private**）
- 各テナントの user_metadata に保存される path:
  - `logo_path`: ロゴ画像の path（バケット内）
  - `stamp_path`: 印鑑画像の path（バケット内）
- 型: `ShopInfo`（`lib/types.ts` 105〜113）

## 取得経路（サーバー側）

1. `lib/shop.ts` の `getShopInfo()` で `auth.users.user_metadata` から `ShopInfo` を組み立てる
   - `logo_path` / `stamp_path` は path のみ。生の URL ではない
2. `lib/shop.ts` の `getShopAssetSignedUrl(path, expiresInSec = 3600)` で signed URL を発行
   - 内部で `supabase.storage.from("shop-assets").createSignedUrl(path, expiresInSec)` を呼ぶ
   - path が null なら null を返す
3. SSR ページ（`invoice/page.tsx`, `estimate/page.tsx`）で
   `Promise.all([getShopAssetSignedUrl(shop.logo_path), getShopAssetSignedUrl(shop.stamp_path)])`
   から `logoUrl` / `stampUrl` を得る

## 現状の PDF での利用

- `logoUrl`:
  - 帳票本文の左下に画像として埋め込み（`<img>` 経由で html2canvas に取り込まれる）
  - 同時に `<PdfButton watermarkUrl={logoUrl} />` として透かしロゴにも使用
- `stampUrl`:
  - 店舗名の背面に印鑑として重ねて表示

## 新方式（jspdf-autotable）での扱い方

- 画像は signed URL → fetch → base64 化 → `pdf.addImage(...)` で貼り付ける
- ロゴと印鑑は本文に埋め込み
- 透かしは現状と同じく中央配置・透明度約 10%（jsPDF GState 利用）
- signed URL の TTL は 1 時間。発行直後に PDF 化するので失効リスクは低いが、fetch 失敗時は警告ログのみで本文 PDF は継続生成（既存と同じ挙動を維持）

## 設定画面（ファイルアップロード元）

ユーザーがロゴ・印鑑をアップロードする UI:

- `app/dashboard/settings/settings-form.tsx`
- `app/dashboard/settings/image-upload.tsx`
- `app/dashboard/settings/actions.ts`

実装上の path 規約（書込み側のコード）は新方式では触らない。読み取り経路のみ利用する。
