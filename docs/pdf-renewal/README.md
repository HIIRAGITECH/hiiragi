# PDF 生成（v2: jspdf-autotable + 日本語フォント埋め込み）

旧方式（html2canvas-pro で HTML 帳票を画像化 → jspdf に貼り付け）から、
**jspdf + jspdf-autotable + NotoSansJP 埋め込み** によるベクター PDF 生成へ移行した。

## 新方式の構成

```
lib/pdf/
├── file-name.ts                # ファイル名生成（旧から維持）
├── fonts/
│   ├── noto-sans-jp.ts         # 自動生成（base64 化された TTF）
│   └── register.ts             # jsPDF にフォントを登録
└── v2/
    ├── index.ts                # generateOrderPdf を re-export
    ├── generate.ts             # 本体エントリ
    ├── types.ts                # PdfRenderInput など
    ├── constants.ts            # PAGE / COLORS / FONT_SIZE / CATEGORIES
    ├── context.ts              # RenderContext + ヘルパ
    ├── assets.ts               # 画像 fetch → base64
    ├── utils/
    │   └── image.ts            # format 判定 / 自然サイズ取得 / box フィット
    ├── sections/
    │   ├── header.ts           # ロゴ + タイトル + 文書情報
    │   ├── parties.ts          # 顧客 / 店舗 / 印鑑
    │   ├── vehicle.ts          # 車両情報
    │   ├── items-table.ts      # 明細（カテゴリ見出し + colSpan）
    │   ├── totals.ts           # 合計欄
    │   ├── payment-info.ts     # 振込先 + 振込期限（請求書のみ）
    │   └── notes.ts            # 備考
    └── overlays/
        ├── watermark.ts        # 透かし（全ページ中央）
        └── continuation-header.ts  # 2ページ目以降の上部帯
```

## 呼び出しフロー

```
pdf-button.tsx (Client)
  ↓ クリック
  ├── 動的 import: lib/pdf/v2 (フォント込みで重いので遅延ロード)
  ├── fetchTenantAssets(logoUrl, stampUrl) で base64 化
  ├── generateOrderPdf(input) → Blob
  ├── buildPdfFileName で命名
  └── a.click() でダウンロード
```

## 拡張方法

### 帳票項目を追加・変更したい

`lib/pdf/v2/sections/` に追加 or 既存ファイルを編集する。
section 関数は `(doc: jsPDF, ctx: RenderContext) => number` のシグネチャで、
描画後の Y 座標を返す。`generate.ts` で順番に呼ぶ形なので、新セクションを差し込みやすい。

### 色・余白・フォントサイズ

`lib/pdf/v2/constants.ts` に集約。`PAGE.marginTop = 25mm` は 2ページ目以降の
continuation-header（Y=10〜14mm）と本文が被らないよう確保している。減らす場合は
overlay の Y 値も合わせて調整すること。

### 別のフォントを使いたい

1. TTF を入手（CFF/OTF は jsPDF が一部解釈できない）
2. `.tmp/fonts/` に置いて `pnpm build:jp-font` を実行
3. `lib/pdf/v2/constants.ts` の `FONT_FAMILY` を変える

OTF しかない場合: `pip install otf2ttf` で TTF に変換できる。手順は `scripts/build-jp-font.mjs` 冒頭コメント参照。

### 別の文書タイプを追加したい

`PdfDocumentType` を拡張し、`generate.ts` のタイトルや section 内の分岐
（リード文・振込先表示など）を更新。`payment-info.ts` のように
`if (ctx.input.documentType !== "invoice") return ctx.cursorY` のパターンで
セクション単位の出し分けが可能。

## 画像（ロゴ・印鑑）の扱い

- Supabase Storage の `shop-assets` バケット（private）に保存
- サーバー側で `getShopAssetSignedUrl` で signed URL を発行
- クライアント側で `fetchTenantAssets` で fetch → base64 化
- 失敗時は undefined を返し、PDF 側は no-op で継続（fail-soft）

## 明細テーブルの C 案について

車検（非課税）など `labor_cost / parts_cost` がいずれも未設定の明細では、
「工賃 / 部品代」セルを `colSpan: 2` で結合し `unit_price` を 1 セルで表示する。
`labor_cost` か `parts_cost` のいずれかが入っている明細は通常の 5 列。
判定ロジックは `printable-document.tsx` と一致させている。

## テスト

`docs/pdf-renewal/manual-test.md` に手動テストのチェックリスト。
自動テストは未整備（HTML 帳票描画と異なり jsPDF 出力をスナップショット比較するのが
重く、現状はコスト見合いで手動運用）。
