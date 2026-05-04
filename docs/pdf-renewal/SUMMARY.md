# feat/pdf-autotable サマリ

PDF 生成を **html2canvas-pro 方式 → jspdf-autotable + 日本語フォント埋め込み方式** に
全面リニューアルしたブランチ。

## 何が変わったか

### コード
- `lib/pdf/v2/` を新設し、PDF 生成ロジックを集約（section / overlay / utils 構成）
- `lib/pdf/fonts/` に NotoSansJP の TTF を base64 化して同梱
- `app/dashboard/orders/[id]/pdf-button.tsx` を新方式に差し替え（旧シグネチャは破棄）
- `app/dashboard/orders/[id]/{estimate,invoice}/page.tsx` の PdfButton 呼び出しを新 Props に更新
- `app/dashboard/orders/[id]/printable-document.tsx` は **触っていない**（HTML 帳票表示用に維持）

### 削除
- `lib/pdf/generate-pdf.ts`（旧 html2canvas-pro 方式）
- `lib/pdf/legacy/`（バックアップ）
- 依存: `html2canvas-pro`、`@fontsource/noto-sans-jp`（後者は woff のみで未使用）

### 追加された依存
- `jspdf-autotable` (^5.0.7)

### ドキュメント
- `docs/pdf-renewal/data-fields.md` — 帳票項目チェックリスト
- `docs/pdf-renewal/data-types.md` — 既存型の所在マップ
- `docs/pdf-renewal/assets.md` — ロゴ・印鑑の取得経路
- `docs/pdf-renewal/manual-test.md` — 手動テストチェックリスト
- `docs/pdf-renewal/README.md` — 新方式の概要・拡張方法

### 副作用的な修正
- `app/dashboard/settings/image-upload.tsx`: `pnpm install` 後の lint 強化に追従し
  `useEffect` 内の同期 setState を派生状態に書き換え（PDF とは無関係の追従）
- `eslint.config.mjs`: `lib/pdf/fonts/noto-sans-jp.ts`（11MB+ の base64）を
  globalIgnores に追加
- `.gitignore`: `.tmp/`（フォントバイナリ作業用）を追加
- `pnpm-lock.yaml` を新規追加（リポジトリには `package-lock.json` が残っているため別途整理が必要）

## main へマージする前のチェックリスト

- [ ] `docs/pdf-renewal/manual-test.md` のチェックを全項目クリア
- [ ] 印鑑の位置（既存 HTML 帳票準拠で店舗名右側に重ねる方針）が PM 確認 OK
- [ ] 透かしの不透明度（0.08）が読みやすさを損なっていないか目視確認
- [ ] 複数ページにまたがる注文で 2 ページ目以降のヘッダー帯と autoTable のヘッダー繰り返しが両立
- [ ] iPhone Safari でダウンロードが動く（旧 isIOS 分岐は削除済み、a タグ click 統一）
- [ ] CI が通る
- [ ] `package-lock.json` と `pnpm-lock.yaml` の二重管理を別 PR で整理する計画

## 既知の制限

- `lib/pdf/fonts/noto-sans-jp.ts` が 11.7MB（base64 化された TTF）でリポジトリに含まれる。
  PDF を出すクライアントは初回ボタン押下時に約 12MB の JS チャンクを取得する（動的 import）。
- 透かしは「ページ追加後にループで上書き描画」する方式。本文より後に描画されるため、
  本文の上に薄く重なる。jsPDF にページ追加フックがないための割り切り。
- jsPDF は OTF（CFF）を一部しか解釈できないため、フォントを差し替える場合は TTF が必要。
  OTF → TTF 変換手順は `scripts/build-jp-font.mjs` 冒頭コメントに記載。
- `printable-document.tsx`（HTML 帳票表示）と PDF 出力は別レンダラ。意図せずズレないよう、
  合計計算は `lib/orders/totals.ts` を共通化、判定ロジック（カテゴリ振り分け、`hasBankInfo`、
  `formatDateJP`）は片方を変える時にもう片方を確認すること。
- 自動テストは未整備。snapshot 比較を入れる際は仮想ブラウザで Image() を動かす環境が必要。
- `app/dashboard/orders/[id]/pdf-v2-test/` は Step 6 で削除済み。

## ブランチで打たれたコミット

```
Step 0: PDFリニューアル準備（現状調査とバックアップ）
Step 1: NotoSansJP日本語フォントの埋め込み準備
Step 2: jspdf-autotable導入と最小構成PDF生成（骨組み）
Step 3: 帳票本体の構築（ヘッダー・顧客/車両・明細・合計・備考）
Step 4: 複数ページヘッダー（日本語）と透かしロゴ
Step 5: ロゴ・印鑑画像の取り込みと配置
Step 6: pdf-buttonを新方式に切り替え（旧コードは@deprecated）
Step 7: 旧PDF生成コード（html2canvas-pro）の撤去
```
