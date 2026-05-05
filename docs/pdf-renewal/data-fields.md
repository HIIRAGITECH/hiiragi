# PDF 出力データ項目チェックリスト

`app/dashboard/orders/[id]/printable-document.tsx` の表示項目を全て列挙。
新方式（jspdf-autotable）でも同じ項目を出すこと。

## ヘッダー

- [ ] タイトル（`見積書` / `請求書`）— `type` で切替
- [ ] 顧客名 + 「様」— `customer.name`
- [ ] リード文（見積: 「下記の通りお見積申し上げます。」 / 請求: 「下記の通りご請求申し上げます。」）
- [ ] 店舗ロゴ画像（`logoUrl`、左下、高さ約 12mm）

## 文書メタ情報（右側）

- [ ] 管理No. — `order.id`
- [ ] 発行日 — 当日（`new Date()`）を `formatDate` で表示
- [ ] 受付日 — `order.reception_date` を `formatDate` で表示

## 店舗情報（右側、印鑑の下）

- [ ] 印鑑画像（`stampUrl`、店舗名の右側に重ねる）
- [ ] 店舗名 — `shop.shop_name`
- [ ] 住所 — `shop.address`
- [ ] 電話番号 — `shop.phone`（`TEL: xxx`）
- [ ] 登録番号 — `shop.registration_no`（`登録番号: xxx`）

## 車両情報

- [ ] ナンバー — `vehicle.plate_number`
- [ ] メーカー / 車種 — `vehicle.maker` / `vehicle.model`
- [ ] 年式 — `vehicle.model_year`（`xxxx年`）
- [ ] 車台番号 — `vehicle.vin`

## 明細（3 セクションに分割）

セクション分割ルール：

- 整備費用: `items.filter(i => i.type !== "shaken")`（showBreakdown = true）
- 車検費用（課税）: `items.filter(i => i.type === "shaken" && !i.tax_free)`（showBreakdown = true）
- 車検費用（非課税）: `items.filter(i => i.type === "shaken" && i.tax_free === true)`（showBreakdown = false）

各セクションの列：

- showBreakdown = true の場合: 品名 / 数量 / 工賃 / 部品代 / 小計
- showBreakdown = false の場合: 品名 / 数量 / 単価 / 小計

明細が 0 件の場合は「明細がありません。」を表示。

## 合計欄（右寄せ、幅 約 72mm）

- [ ] 整備小計（subtotal > 0 の時のみ）
- [ ] 車検課税小計（subtotal > 0 の時のみ）
- [ ] 車検非課税小計（subtotal > 0 の時のみ）
- [ ] 値引き（discount > 0 の時のみ、`− ¥xxx`、上に divider 線）
- [ ] 課税対象額（上に divider 線）
- [ ] 消費税(10%)
- [ ] 合計（上下に二重線、太字、文字サイズ大）
- [ ] 預かり金（deposit > 0 の時のみ、`− ¥xxx`）
- [ ] 差引請求額（deposit > 0 の時のみ、上下に二重線、太字、文字サイズ大）

## 振込先（請求書のみ・全フィールド未入力時は非表示）

- [ ] 銀行・支店 — `bank.bank_name` + ` ` + `bank.branch_name`
- [ ] 種別 / 番号 — `bank.account_type` + ` ` + `bank.account_number`（等幅）
- [ ] 名義 — `bank.account_holder`

## 振込期限（請求書のみ・`order.payment_due_date` が null でない時）

- [ ] 「お振込期限: YYYY年M月D日」

## 備考（`order.notes` が null/空でない時）

- [ ] 備考タイトル
- [ ] 本文（改行保持、`whitespace-pre-wrap`）

## 計算系の参照先

- 合計計算: `lib/orders/totals.ts` の `calculateTotals(items, discount, deposit)`
- 行小計: `lib/orders/totals.ts` の `rowSubtotal(item)`
- 通貨フォーマット: `lib/format.ts` の `formatYen(n)`
- 日付フォーマット: `lib/format.ts` の `formatDate(s)`
