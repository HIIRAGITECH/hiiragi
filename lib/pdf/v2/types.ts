import type {
  Customer,
  Order,
  OrderItem,
  ShopInfo,
  Vehicle,
} from "@/lib/types";

// 文書種別: 見積書 / 請求書
export type PdfDocumentType = "estimate" | "invoice";

// PDF 生成に渡すデータ。画像は base64 化済みで受け取る（fetch は呼び出し側で行う）。
export interface PdfRenderInput {
  documentType: PdfDocumentType;
  order: Order;
  // order.items と同じだが、明示的にトップレベルでも持たせて
  // 呼び出し側でフィルタ済みの配列を差し込みやすくする。
  // 省略時は order.items を使う。
  items?: OrderItem[];
  // 既存プロジェクトには Tenant 型はなく ShopInfo 型を使う（lib/types.ts:105）
  shop: ShopInfo;
  customer: Customer | null;
  vehicle: Vehicle | null;
  // ロゴ画像（data URL, "data:image/png;base64,..." 形式）。Step 5 で実装。
  logoDataUrl?: string;
  // 印鑑画像（data URL）。Step 5 で実装。
  stampDataUrl?: string;
}
