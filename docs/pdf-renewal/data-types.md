# PDF 生成で参照する型定義

すべて **`lib/types.ts`** に集約されている。`types/` ディレクトリは存在しない。
新方式の実装では `import { ... } from "@/lib/types"` で取り込むこと。

| 型 | 定義場所 | 行 | 用途 |
| --- | --- | --- | --- |
| `Customer` | `lib/types.ts` | 1〜13 | 顧客名（宛名）参照 |
| `Vehicle` | `lib/types.ts` | 15〜28 | 車両情報セクション |
| `OrderItem` | `lib/types.ts` | 58〜66 | 明細行（normal / shaken の type、tax_free、labor_cost、parts_cost を持つ） |
| `Order` | `lib/types.ts` | 68〜88 | 受注本体。`items[]`, `discount_amount`, `deposit_amount`, `payment_due_date`, `notes`, `reception_date`, `invoiced_at` などを参照 |
| `BankInfo` | `lib/types.ts` | 94〜100 | 請求書の振込先 |
| `ShopInfo` | `lib/types.ts` | 105〜113 | 店舗情報。`logo_path` / `stamp_path` は Supabase Storage `shop-assets` バケットの path（生 URL ではない） |
| `BankAccountType` | `lib/types.ts` | 91 | `"普通" | "当座"` |
| `WorkStatus / EstimateStatus / InvoiceStatus` | `lib/types.ts` | 41 / 45 / 49 | PDF では未使用 |

## 補助 util の場所

| 関数 | 場所 |
| --- | --- |
| `calculateTotals` | `lib/orders/totals.ts` |
| `rowSubtotal` | `lib/orders/totals.ts` |
| `formatYen` | `lib/format.ts` |
| `formatDate` | `lib/format.ts` |
| `getShopInfo` | `lib/shop.ts` |
| `getShopAssetSignedUrl` | `lib/shop.ts` |
| `buildPdfFileName` | `lib/pdf/file-name.ts` |
| `sanitizeFileName` | `lib/pdf/file-name.ts` |

## 画面 / ボタンの場所

| 役割 | 場所 |
| --- | --- |
| PDF ボタン（クライアント） | `app/dashboard/orders/[id]/pdf-button.tsx` |
| 帳票表示 (DOM) | `app/dashboard/orders/[id]/printable-document.tsx` |
| 見積ページ（SSR、データ取得） | `app/dashboard/orders/[id]/estimate/page.tsx` |
| 請求ページ（SSR、データ取得） | `app/dashboard/orders/[id]/invoice/page.tsx` |
