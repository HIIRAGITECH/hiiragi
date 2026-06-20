# HIIRAGI 開発ドキュメント（横断・経緯記録）

> **このドキュメントの役割**
> 複数のClaudeチャット（Stripe実装・明細リニューアル等）が並行して走っているため、
> 全体像・意思決定の背景・今後の予定を1か所に集約する。
>
> **使い方（重要）**
> - **「なぜそう決めたか」「全体で今なにが動いているか」「次になにをやるか」** はこのドキュメントを見る。
> - **「今のコードが実際どうなっているか」という事実確認は、必ずClaude Codeに聞く。**
>   ドキュメントは書いた瞬間から古くなるが、コードは常に現在の真実。両方を使い分ける。
> - 各チャットでの作業が一区切りついたら、末尾の「作業ログ」に追記し、必要なら上部の「現状スナップショット」を更新する。
> - 新しいチャットを始めるときは、まずこのドキュメントを読み、それからコードの現状をClaude Codeに確認してもらう。

---

## 0. プロジェクト基本情報

- **HIIRAGI** = バイク整備工場向けマルチテナントSaaS
- 技術: Next.js 16 + TypeScript + Supabase + Vercel
- リポジトリ: GitHub `HIIRAGITECH/hiiragi`（private, main直コミット運用）
- 本番URL: https://app.hiiragi-tech.app
- 開発支援: Claude Code v2.1.x（Supabase MCP接続、dev/prod両方）
- DB: dev / prod の2プロジェクト。本番スキーマ変更はマイグレーション or SQL Editor
- 開発者: 1人（ソロfounder）
- 主要テストユーザー: ヒデヨシテクニカルサプライ様

---

## 1. 現状スナップショット（常に最新を保つ）

最終更新: 2026-06-20（Stripe土台prod反映＝subscriptionsにstripe列適用。Stripe本番化に着手）

| 領域 | 状態 |
|---|---|
| 受注・見積・請求・顧客・部品在庫・作業メニュー・入金・売上・PDF・ダッシュボード | ✅ 本番稼働中（SaaSの基本機能は一通り揃っている） |
| お客様マイページ（作業状況の共有URL） | ✅ dev・prod両方反映完了・本番稼働（2026-06-20 prod適用・障害復旧）。受注ごとURLトークン／45日／ログイン不要／閲覧のみ。ステータス連動表示・課金連動（options.mypage）＋管理者バイパス・SECURITY DEFINER関数で最小権限読み取り（DB 2本=20260618000000/20260618010000・prod適用済・関数EXECUTEはservice_roleのみ）。エンドユーザー向けプライバシー表示をフッターに追加（コーポレートサイト https://hiiragi-tech.app/privacy へリンク・2026-06-20） |
| 受注明細：部品在庫から追加 | ✅ 完了・本番反映済み（Step 1 / commit a60e1bf） |
| 在庫の確保・消費（ステータス連動） | ✅ 完了・本番反映＋dev実値検証済み（Step 2 / commit 2a7fec8）。UI表層の目視のみ任意で残 |
| Stripe Billing | 🚧 mainマージ済み（`08f8b1e`、stripe-保存_0604=8e6ad48 を取込）・ビルド通過・dev動作未確認。**prod DBにStripe列適用済み（2026-06-20＝subscriptionsにstripe_customer_id/stripe_subscription_id＋index2本／台帳20260531120000登録）**。土台のみ完了、Stripe本番化（liveキー・本番Webhook・本番price・アクセス制御）は未対応 |
| 管理画面リニューアル（/admin） | ✅ mainにマージ済み（`08f8b1e` に同梱）。/admin・/admin/users/[id] が main で利用可能 |
| 車種別定価（利益エンジン） | 🚧 Step 3-1（テーブル）・3-2a（variant登録UI）・3-2b（明細への⭐呼び出し＋定価反映）完了・本番反映済み。利益エンジンが本番で稼働。次はStep 3-2c（スナップショット・任意） |

---

## 2. 進行中のワークストリーム（並行チャットの地図）

> 2026-06-04 夜にリポジトリ全体を棚卸しした結果（Claude Code調査）。

| ワークストリーム | 状態 | 在りか | 残課題・備考 |
|---|---|---|---|
| 受注明細リニューアル（在庫連携） | Step1/2完了、Step3も実用上完成 | main | このチャット。下記ロードマップ参照 |
| Stripe Billing / サブスク課金 | ✅ mainマージ済み（2026-06-17・`08f8b1e`）・ビルド通過・dev動作未確認 | main（stripe-保存_0604=`8e6ad48` を取込／backupタグ `backup-before-stripe-merge`=`b853f87` 残置） | ①dev動作確認（前回5/31はテスト課金成功まで到達済み） ②trial期限到達時のアプリ側アクセスロック未実装 ③prodにStripe2カラム＋service_role GRANT未適用 ④Vercel本番デプロイ＋本番Webhook＋本番price ID |
| 管理画面リニューアル（/dashboard/admin → /admin） | ✅ mainマージ済み（2026-06-17・`08f8b1e` に同梱） | main | **Stripeとは独立した別機能**。ユーザごとのplan/status/options（mypage/line_notify/hp_integration）を手動編集するUI。`subscriptions.options.mypage` トグルはマイページ実装時の課金連動に再利用予定 |
| 車種別定価 / 利益エンジン（Step 3） | ✅ 実用上完成・本番稼働 | main | Step3-1/2a/2b完了。明細で車種別定価が⭐表示＆反映。3-2c（スナップショット）は「今は不要」判断 |
| 業販対応（法人/個人で明細の見せ方を変える） | ✅ 完成・本番稼働 | main | 顧客区分→マスター掛け率→明細業販反映→画面個人/法人切替→PDF個人/法人切替まで全通し。個人=単価1列、法人=単価/業販/参考定価＋合計欄に参考定価税込併記。PDFも同様。残課題=PDF複数ページのヘッダ繰り返し（別テーマ・下記） |
| メニュー単機能化／部品在庫一本化 | 🚧 段1（メニューを1金額の項目に）本番反映済 | main | メニュー＝売値1・原価1・掛け率1の単一項目に。旧カラムは後方互換で温存（DROP未）。次=段2（明細の列を金額1列に統合・「技術料」へ文言変更・PDF・旧カラムDROP） |
| マイグレーション台帳の整合性回復 | 第1・2段階完了（実用上OK） | dev/prod両方 | prod台帳18→19本でリポジトリと整合。db pushで新規分を足せる状態。残=F06/F13重複・dev側ズレ・孤児（第3段階・急がない） |

### 把握済み・本番稼働中の主要機能（棚卸しで確認）
認証 / 受注・見積（カンバン+テーブル）/ 受注明細（Step1・2入り）/ 顧客管理 / 部品在庫マスター（原価・売価・品番・発注点）/ 作業メニュー・セット・業務カテゴリ / 入金管理 / 売上集計 / 店舗設定 / 請求書PDF（react-pdf）/ KPIダッシュボード / 簡易管理画面（/dashboard/admin）/ 業務カテゴリ自動seed / レガシーid採番トリガ削除（車両登録不能問題の恒久対策）。

---

## 3. ロードマップ（受注明細リニューアル）

- ✅ **Step 1**: 部品在庫から明細に追加（最優先要望）
- ✅ **Step 2**: ステータス連動の在庫確保／消費
- 🚧 **Step 3**: 車種別定価（利益エンジン）。**Step 3-1（テーブル）・3-2a（variant登録UI）・3-2b（明細への⭐呼び出し＋定価反映）完了（2026-06-07・本番反映・本番で稼働確認済み）**。
  3-2bの挙動: 受注の車両の `model` を `vehicle_tags` と照合（正規化後の完全一致／記号・大小・全角半角は吸収／makerは未使用）。
  一致したvariantに⭐＋「車種別 ¥定価」を表示し、選ぶと `parts_cost` に定価が入る（明細に品番は出さない）。
  一致が無ければ部品在庫の `sale_price` を使用（売価が空なら0になる点に注意）。車両未設定なら⭐は出ない。
  照合ヘルパー `normalizeForVehicleMatch` は items-form.tsx 内。OrderItem構造は不変（マイグレーション無し）。
  残り: Step 3-2c（明細へ品番・定価を `linked_variant_id` 等でスナップショット保存。出どころの追跡・組ごとの集計用）。
  → **2026-06-07時点で「今は不要」と判断**。定価の過去保護は3-2bで達成済み（明細に数字で焼き付く）。
  出どころ追跡・集計が実際に欲しくなったら作る。OrderItemにフィールド追加＝マイグレーションを伴うため、必要性が出てから。
  **Step 3 は実用上完成（利益エンジン本番稼働）。**
  同じ部品でも「車両の車種」ごとに純正パーツ価格が異なり、
  その差が利益になる。受注に車種を持たせ、部品の車種別定価から自動で売価を埋める方向。
  **設計方針（重要）**:
  - 全テナント共通の機能として作る。「アカウントで出し分け」「メールアドレスで分岐」はしない（脆く、後で広めにくい）。
  - 「車種別定価を登録した部品にだけ機能が現れる」＝データの有無で自然に出し分け。
    使わない工場には透明。最初に使うのは小野寺さんだけ、という状態が自然に成立する（＝自分で先に試せる）。
  - ON/OFFトグルにもしない（「分からない機能」を増やすだけ）。
  - 「賢いデフォルト」志向: ユーザーに選ばせず、車種に応じた定価を先回りで埋める。嫌なら変えられる。
    面倒くさがりでも勝手に利益が乗るUIにする。
  - **焦って作らない領域**: データ構造（車種をどう持つか）を一度決めると変更コストが高い。
    まずスプレッドシートで2階（車種別品番・定価）を育て、構造が見えてからアプリ化する。

  **データ構造（数日かけて固めた到達点・2026-06-07）**:
  - **部品は寸法で1行（在庫は割らない）**。1つの物理部品（例: スライドメタル T1.0 L20、43/47/15のブッシュ）に対し、
    「品番＋定価＋適合車種タグ（複数可）」の"組"を複数ぶら下げる（1対多）。
    例: スライドメタル T1.0 L20 ← ①3XV-23135-20/¥5,590/TZR初期型 ②3MA-23135-10/¥4,160/TZR
        ③51121-39A40/¥1,400/[グース, GSX400, …]。1つの品番に複数車種がタグでぶら下がるのも可。
  - 仕入れは寸法（一番安い品番）、請求は車種（その車種の組の定価）、品番は発注・廃番管理用。**3つの軸は役割が違うだけで競合しない**。
  - 受注の車種でヒットした組を、車種別定価つきで明細に出す（= Step1の「部品在庫から追加」の車種版。Step1/2の土台を再利用）。
  - 明細に出るのは部品名＋定価のみ。原価・粗利は社内用（Step1で実装済みの分離がそのまま利益モデルになる）。
  - **データは仕事のたびにその都度追加**（全車種を最初から網羅しない）。足す操作は極限まで軽く（受注作業中にワンタップで追加できる形）。

  **車種の表記ゆれ対策（2026-06-07）**:
  - 立派な「車種マスター」という土台は**作らない**（当面は1テナント1人入力の想定なので過剰）。
  - 「正確に入力する」前提で割り切る（名前が違えば出ないのはシステムとして当然）。
  - ただし軽い補助は付ける: ①記号/大文字小文字/空白を無視したゆるい照合（GSXR1000≒GSX-R1000）、
    ②過去入力した車種名のサジェスト（打ち直さず選べる→結果的にゆれない）。
  - **将来 複数人入力が本格化したら**、車種マスター＋名寄せ統合（似た候補の警告・項目の統合）を再検討。今はやらない。
  - 補足: AIで主要車種の辞書初期データを用意し、メーカー・排気量で絞って選ばせる案は有力だが、これも複数人運用が見えてから。

  **スコープの線引き（重要）**:
  - アプリが引き受けるのは「明細に化ける構造化部分」＝部品＋車種別品番・定価まで。
  - スプリングレート/シム構成/油面/エア抜き回数などの測定値・作業手順メモは**アプリにフル機能の表計算を作らない**。
    自由記述欄やスプレッドシートに任せる（「アプリ内スプレッドシート」は重すぎ・明細に化けず・Googleで足りる、ため不採用）。
  - サスペンション技術データベース（②）は小野寺さん特化の事業ノウハウ。同じ「車両にぶら下げる」土台の上に後から乗せられるので、今は急がない。
- ⬜ （以降は運用しながら決定。業販/定価＝顧客タイプ別の出し分けも、車種別定価と関連して再検討）

---

## 4. 意思決定ログ（なぜそう決めたか・追記型）

### 2026-06-20 ── Stripe土台 prod反映（stripe列）

- **経緯**：マイページ障害対応時の棚卸しで、subscriptions の `stripe_customer_id` /
  `stripe_subscription_id` がprod未反映と判明していた（黄・Stripe本番稼働前に必須）。
  Stripe本番化に着手するにあたり、まず土台としてこの列をprodに適用。
- **適用内容**：`20260531120000_add_stripe_to_subscriptions` 相当を
  prod SQL Editorで手動適用（単一トランザクション・冪等）。
  - `stripe_customer_id` / `stripe_subscription_id` 列（text）
  - 部分ユニークindex 2本（`subscriptions_stripe_customer_id_uidx` /
    `subscriptions_stripe_subscription_id_uidx`・`WHERE ... IS NOT NULL`）
  - 台帳に `20260531120000`（name=`add_stripe_to_subscriptions`）登録
- **検証完了**：`columns_ok` / `indexes_ok` / `ledger_ok` すべて true。
- **prod確認で判明した補足**：
  - service_role の subscriptions DML権限はprodで既に充足（ACL=`arwdDxtm`）。
    `grant_subscriptions_to_service_role`（`20260531140000`）は機能的に不要だった
    （Supabaseベースライン付与で既に有り。台帳に記録が無いだけ）。
  - `create_subscriptions` テーブル・トライアル自動付与トリガー
    （`auth_users_create_subscription`）はprodで稼働中。RLS（本人SELECT）も有効。
- **重要**：列を足しただけで**Stripeはまだ本番稼働していない**
  （live キー・本番Webhook・本番price 未設定）。残タスクは §5 にリスト化。

### 2026-06-20 ── マイページにエンドユーザー向けプライバシー表示を追加（本番反映）

- **内容**: `app/mypage/[token]/mypage-view.tsx` のフッター（店舗情報ブロックの下）に、
  お客様向けの控えめなプライバシー表示（`PrivacyNote`）を追加。見出し「このページについて」＋
  箇条書き5項目（情報は店舗が登録・管理／URL所持者のみ閲覧・有効期限あり／HIIRAGIによる表示／
  プライバシーポリシーへの導線／問い合わせは店舗へ）。
- **リンク先**: 「プライバシーポリシー」を https://hiiragi-tech.app/privacy への外部リンクに
  （`target="_blank" rel="noopener noreferrer"`・下線程度の軽いスタイル）。
  privacy 文書はコーポレートサイト（別リポジトリ `hiiragi-tech-hp`）に既に本番公開済み（2026-06-18）。
- **スタイル**: フッター基調（`text-xs` / `--color-ink-light`）に揃え、箇条書きのみ `text-left` で
  スマホでも読みやすく。威圧感のない見た目。
- **DB変更なし**（コードのみ）。prod DB反映は不要・Vercel自動デプロイで完結。
- `npm run build` 通過・dev実機確認済み。

### 2026-06-20 ── マイページ機能 prod反映（本番障害復旧）

- **経緯**：マイページのコードは6/18にmainへpush・本番デプロイ済みだったが、
  prod DBへのマイグレーション2本が未適用のまま放置されていた。
  別チャット（業販対応）で本番受注一覧を開いた際に
  「column orders.mypage_token does not exist」で受注一覧が全滅する障害が発生。
- **原因**：コードは `mypage_token` 列を参照するが、prod DBに列が無い（コードとDBの食い違い）。
  「dev完成・prod反映は別作業」のラグが顕在化したもの。
- **対応**：以下2マイグレーションをprodにSQL Editorで手動適用（単一トランザクション・BEGIN/COMMIT）。
  - `20260618000000_add_mypage_token_to_orders`（`mypage_token`/`mypage_expires_at`列＋部分UNIQUE index）
  - `20260618010000_create_mypage_get_by_token`（SECURITY DEFINER関数）
- **検証完了**：列2・index・関数・台帳2件すべてprodに存在を確認。
  関数のEXECUTE権限も service_role のみ（anon/authenticated/public=false）でdevと完全一致。
  本番受注一覧の表示も復旧を確認。
- prod MCPはread_only維持・書き込みは手動SQLの運用ルールに従った。
- **【教訓】devでDB変更を伴う機能を完成させたら、コードを本番デプロイする前または同時に
  prod DBへのマイグレーション適用を必ずセットで行う。** コードだけ先行デプロイすると
  「列が無くて即落ち」の本番障害になる。特に複数チャット・複数PCで本番を並行して
  触る場合、prod反映の有無が伝わりにくいので要注意。

### 2026-06-18 ── お客様マイページ機能 dev完成

- **方式**: URLトークン（受注ごと・45日・ログイン不要・閲覧のみ）。設計確定は6/17。
- **DB**: `orders` に `mypage_token` / `mypage_expires_at` 追加（migration `20260618000000`）。
  `mypage_token` に部分ユニークインデックス（発行済みのみ一意・未発行NULLは対象外）。
- **表示**: `app/mypage/[token]/`（サーバーコンポーネント・公開ルート）。ステータス連動で
  見積／作業中／完了／請求／入金を出し分け：
  - `estimate_status=発行済/了承済` → 見積セクション（明細＋金額）
  - `work_status=作業中` → 「作業を進めております」、`work_status=完了` → 「作業完了」＋最終明細
  - `invoice_status=請求済` → お支払い金額・振込期限・振込先（手動操作がトリガー）
  - `invoice_status=入金済` → お礼＋入金確認日
  - `photo_folder_url` あり（作業中/完了）→「作業写真を見る」リンク
- **表示はPDF非貼付・画面に明細HTML表示（案A）**。原価粗利・お客様の住所/電話・内部メモ（intake notes・
  estimate_notes）は非表示（invoice_notesのみ表示可）。モバイルファースト・max-width中央寄せ。
- **【セキュリティ・重要】service role読み取りは案B（SECURITY DEFINER 関数 `mypage_get_by_token`）で実装**
  （migration `20260618010000`）。`orders`/`customers`/`vehicles` に service_role の GRANT は付与せず、
  関数1つだけを公開窓口にする最小権限構成。鍵漏洩時も他テナント情報が芋づる式に漏れない。
  `search_path=''` 固定・全テーブルをスキーマ修飾、EXECUTE は service_role のみ
  （anon/authenticated/PUBLIC は REVOKE）。関数は「お客様に見せてよい列だけ」を返し、
  アプリ側 `toMypageItem` のサニタイズと合わせて二重防御。期限切れ判定は loader 側。
- **設計の土台（将来ログイン移行用）**: 「検証（誰に見せるか＝`loadMypageByToken`）」と
  「表示（何を見せるか＝`MypageView`）」を分離。表示は `customer` 軸で組み、`orders` は現状1件だが
  ログイン化で同顧客の複数受注に差し替え可能な構造。
- **【教訓】当初テーブル直読み（service role）で `42501 permission denied for table orders` → not_found に
  黙って化けた**。原因は業務テーブルに service_role SELECT GRANT が無いこと（Googleドライブ連携・Stripeと
  同じ根）。loader の error 握りつぶしも一因。→ rpc の error を `console.error` でログするよう改善済み。
- **課金連動**: `subscriptions.options.mypage=true` のテナントのみ発行ボタン（UI＋サーバーアクション
  `issueMypageToken`/`regenerateMypageToken` の両方でガード。判定は `lib/entitlements.ts` の `canUseMypage`）。
  管理者（`ADMIN_EMAIL`）は無制限。無効時は控えめなアップセル導線（/dashboard/billing）。
  失効（`revokeMypageToken`）は非ゲート。**表示ページ側は課金チェックせず**（発行済URLは期限まで有効＝
  お客様に店舗の課金状態は無関係、突然死を防ぐ）。
- **dev動作確認完了**: 発行→表示→ステータス連動（見積/作業/請求/入金）→振込先表示まで実機で確認。
  情報漏洩なし（原価・住所・電話が画面に出ないことを grep＋実機で確認）。
- **残**: prod反映（`20260618000000` + `20260618010000` + ordersカラム、SQL Editor手動）、
  Vercel本番確認、マイページのモバイル実機確認、プライバシーポリシー整備。

### 2026-06-17 ── Stripeブランチをmainに統合＋マイページ設計確定

**Stripe統合（完了）**
- 家PCローカルのみに存在した `stripe-保存_0604`（commit `8e6ad48`）をmainにマージ。
- 事前にrebaseでorigin最新（Googleドライブ連携入り）を取り込み。マージ衝突は `.mcp.json` 1ファイルのみ。
  → main側の `read_only=true` を採用（prod誤爆防止）。
- `npm run build` 一発通過（型衝突・APIバージョン不整合なし）。origin/mainにpush済み（`08f8b1e`）。
- backupタグ `backup-before-stripe-merge`（`b853f87`）を残置。
- 取り込まれた内容：`app/api/stripe/webhook`、`app/dashboard/billing` 一式、`lib/stripe.ts`、
  `app/admin` 一式、`subscriptions` 系3マイグレーション（20260531系）。
- **Stripe残タスク**：①dev動作確認（前回5/31はテスト課金成功まで到達済み）
  ②トライアル切れ・未課金時のアクセスロック未実装 ③prodにStripe2カラム＋service_role GRANT未適用
  ④Vercel本番デプロイ＋本番Webhook＋本番price ID。

**マイページ機能 設計確定（実装はこれから）**
- **方式**: URLトークン方式・案件（受注）ごと・有効期限45日・ログイン不要・閲覧のみ。
- 将来ログイン方式（全履歴マイカルテ）へ差し替え移行できる土台にする：
  ①表示ロジックを `customer_id` 軸で組む ②表示部分と認証部分を分離 ③`customers.email` を活用前提。
- **DB**: `orders` に `mypage_token (text)` / `mypage_expires_at (timestamptz)` を追加予定
  （前回ロールバック済み・再導入）。
- **発行**: 受注詳細＋一覧に「マイページURL発行」ボタン
  （レベル2＝URL生成＋コピー＋お客様向け文面テンプレ表示、メール自動送信はやらない）。
  再発行（失効）ボタンも付ける（漏洩対策）。
- **表示はステータス連動**（1案件1ページがライブで進む）：
  - `estimate_status=提示済` → 見積明細・見積書PDF
  - `work_status=作業中` → 進捗・写真
  - `invoice_status=請求済`（手動操作がトリガー）→ 請求情報・振込先・写真
  - → 請求情報と振込先は「請求済にする」手動操作で初めて表示。作業完了だけでは出さない
    （金額未確定で振込先が出る事故を防ぐため）。
- **PDFは貼らない方針**（採用案A）：明細・金額・合計は画面にHTML表示。住所・電話・原価粗利・内部メモは出さない。
  → 伏字PDFは作らない（PDF生成ロジックに触れず事故回避）。
  正式な住所入り請求書が必要な客には従来通り別途渡す。
- 承認ボタン等の書き込み機能は今回やらない（将来ログイン方式と一緒に実装）。
- **課金連動**: `subscriptions.options.mypage` が `true` のテナントだけ発行ボタンが出る。
  ただし管理者（`ADMIN_EMAIL` / info@）は全機能を無制限・無料で使える。
- **振込先は店舗設定に登録済み**（マイページでもそこから引く）。

**プライバシー文書（✅ 完了・2026-06-18公開）**
- ~~マイページ公開前に必要・別タスク。マイページ実装後に着手予定~~（当初記録／下記で対応済み）。
- **実際の対応**: コーポレートサイト（別リポジトリ `hiiragi-tech-hp`）に `privacy.md` / `terms.md` を作成し、
  https://hiiragi-tech.app/privacy ・ https://hiiragi-tech.app/terms で本番公開済み（2026-06-18）。
  マイページのエンドユーザー向けプライバシー表示も、この /privacy にリンクしている（2026-06-20追加）。
- マルチテナントの委託関係の整理・弁護士チェックは事業拡大時に改めて検討。

### 2026-06-15 ── Googleドライブ連携 段階4〜5-A（実装・dev動作確認済み・commit `92ec406` / `4d9dfaf`）

段階1〜3の基盤の上に、受注ごとの写真フォルダ作成と連携体験の仕上げを実装。dev確認済み・prod未反映。

- **受注子フォルダの自動作成（段階4・migration `20260615020000`）**: `orders` に `drive_folder_id text` を1本追加
  （採番トリガ `assign_order_id`・既存データ・RLS/GRANTには触れず ADD COLUMN のみ）。
  受注詳細の「📁 写真フォルダを作成」で、親「HIIRAGI受注写真」配下に子フォルダをワンクリック作成。
  `lib/google/drive.ts` の `ensureOrderFolder(userId, orderId)` が担う（冪等）。
- **子フォルダ命名**: `受注番号_顧客名様_車両名`（例 `26MB-0001_山田太郎様_CB400SF`）。
  - 受注番号は完全な `order.id`（`26MB-0001` 形式。ヘッダ表示の `slice(0,8)` は使わない）。
  - **顧客名に敬称「様」を一律付与**。顧客名がNULLなら様も付けない（"様"だけ残さない）。
  - 車両名は maker+model。顧客/車両が未登録なら該当セグメントを省略して名前が破綻しないようにする。
  - サニタイズ: `/ \ : * ? " < > |` を `_` に置換、連続空白・連続`_`・前後の余分記号を整理。
- **共有設定（anyone:reader）**: 子フォルダを「リンクを知っている人は閲覧可」にする。
  `ensureAnyoneReader` が **permissions.list → `type==='anyone'` 無ければ create** で冪等付与（重複createを回避）。
  新規作成時と既存フォルダ返却時の両方で確保（様なしで作った古いフォルダも押下時に共有を自己修復）。
  共有付与は best-effort（失敗してもフォルダ作成は壊さない）。`drive.file` スコープのまま実行可（追加スコープ不要）。
  保存する `photo_folder_url` は webViewLink（閲覧用リンク。お客様に渡せば閲覧できる想定）。
- **orders の書き込みは authenticated クライアント**（service_role ではなく）: この project は
  業務テーブルに service_role DML を付けない流儀。orders に GRANT を増やさず、RLS owner ポリシー＋
  `.eq("user_id")` 明示で安全に書く（`updateOrderItems` と同作法）。トークン側(`google_integrations`)のみ admin/service_role。
- **受注詳細UIの出し分け（段階4）**: 未連携=ボタン無効＋設定誘導 / 連携済み・未作成=「作成」/ 作成済=「開く」。
  既存の手貼りURL欄はフォールバックとして残置（自動作成と排他にしない）。fail-soft（`createOrderPhotoFolder`）。
- **連携時に親フォルダ自動作成（段階5-A）**: callback の upsert 成功直後に `ensureRootFolder` を **best-effort** 実行。
  「連携した瞬間に親フォルダもできる」自然な体験。親作成が失敗しても連携自体は success で返す
  （トークンは保存済み。後で settings/受注の作成ボタンから自己修復）。冪等なので再連携で二重作成しない。
- **settings の連携カード 状態別UI（段階5-A）**: 未連携=連携ボタン / 連携済み=「✅連携済み」＋連携先メール表示＋
  親フォルダを開くリンク（`https://drive.google.com/drive/folders/{root_folder_id}`、root未作成のみ作成導線）＋
  「連携を解除」ボタン。`disconnectGoogleIntegration` は自分の行を削除して未連携に戻す（admin/service_role、user_id明示）。
  **解除はトークン削除のみ**で Drive 上のフォルダ・写真は消さない。
- **残**: prod 反映（テーブル/GRANT/`orders.drive_folder_id` を SQL Editor手動、Vercel env、
  OAuthクライアントの prod リダイレクトURI、同意画面の本番公開）。

### 2026-06-15 ── Googleドライブ連携 段階1〜3（実装・dev動作確認済み・commit `caf5c4c`）

段階0の方針に沿って段階1〜3を実装し、dev（qajr…）で動作確認済み。prod未反映。

- **方式B（各店舗が自分のドライブ・各自持ち）**: 連携した店舗自身のGoogleドライブに保存する。
  `drive.file` スコープで完結（アプリが作成したファイル/フォルダのみ触れる）。**ピッカー不要**＝
  連携時にアプリが親フォルダ「HIIRAGI受注写真」を作り、以後その配下に受注子フォルダを作る。
  既存フォルダを選ばせる仕様にはしない（drive.file の最小権限と整合）。
- **テーブル `google_integrations`**（段階1・migration `20260615000000`）: `user_id` UNIQUE（1店舗1連携）、
  `provider`（'google'固定）、`refresh_token`/`access_token`/`token_expiry`、`root_folder_id`、`deleted_at`。
  RLS有効＋owner ポリシー4本（user_id=auth.uid()）。**refresh_token は当面平文**＋RLS＋service_role経由で保護
  （暗号化は後付け方針）。秘匿情報なので user_metadata ではなくテーブルに置く。
- **【教訓・重要】service_role には DML GRANT が必要だった**（段階2デバッグで判明・migration `20260615010000`）:
  連携成功後の保存が `42501 permission denied for table google_integrations` で失敗した。
  原因は **この project は全テーブルで DML を `authenticated` のみに付与し、`service_role` には付けない流儀**
  （orders/customers/parts_inventory_variants すべて service_role は REFERENCES/TRIGGER/TRUNCATE のみ）。
  業務テーブルは authenticated クライアント（RLS準拠）でアクセスするため service_role DML が不要だった。
  google_integrations だけ admin/service_role で書くため GRANT が要る。
  → **admin/service_role で書くテーブルを新設する際は `GRANT ... TO service_role` を必ずセットで追加する。**
  GRANT はRLSの手前のアクセス権なので、付けてもRLS（ポリシー4本）はそのまま機能する。
  Stripe の「service_role GRANT 未適用」（§5 既知の地雷）と同種の問題。
- **OAuth（段階2）**: `/api/google/oauth/start`・`/api/google/oauth/callback`（ともに runtime=nodejs）。
  - `access_type:"offline"` + `prompt:"consent"` で refresh_token を確実に取得。
  - **state（CSRF対策）**: ランダム値を httpOnly cookie に保存→callbackで照合。user.id は state とは独立に
    `getUser()` でサーバー再確認。
  - **refresh_token は再同意時しか返らない**ため、callback の upsert では「今回取得できた時だけ更新」し、
    **null で既存を上書きして消さない**（access_token/token_expiry/google_email は毎回更新）。
  - 保存は service_role（admin client）で user_id を明示して書く。
- **Drive（段階3）**: `lib/google/drive.ts`（server-only）。
  - `getAuthorizedClient(userId)`: refresh_token をセットした OAuth2 client を返す。API呼び出し時に
    googleapis が自動リフレッシュし、`tokens` イベントで新 access_token/expiry を保存（refresh_token は触らない）。
  - `ensureRootFolder(userId)`: **冪等**。既存 root_folder_id が Drive 上で実在（未ゴミ箱）か確認→OKなら返す、
    無い/削除済みなら作成して保存。親フォルダ未作成の店舗でも親ごと作られる。
  - 動作確認用の手動トリガ `/api/google/drive/ensure-root` と settings の最小導線で dev 確認済み。
- **受注子フォルダ命名（段階4で実装）**: `受注番号_顧客名_車両名`。`/``\` 等の不可文字はサニタイズ、
  顧客/車両がNULLなら該当部を省略しても破綻しないようにする。
- **教訓（googleapis 型）**: `google-auth-library` を直接 import すると googleapis-common 同梱コピーと型が
  二重化して衝突する。OAuth2Client 型は `createOAuthClient()` の戻り型から導出し、Credentials は
  `Auth.Credentials`（googleapis）を使う。
- **残**: ①callback への `ensureRootFolder` 統合（連携＝親フォルダ自動作成。段階4が通ってから最後に回す）
  ②OAuth同意画面の本番公開 ③prod へのテーブル/GRANT/列の反映（SQL Editor手動）。

### 2026-06-15 ── Googleドライブ連携 段階0（下準備・方針確定）

- **全体方針**: 受注詳細から「フォルダ作成ボタン」でGoogleドライブに案件フォルダを作る機能を全5段階で実装。
  段階0=下準備、段階1=テーブル、段階2=OAuthフロー、段階3=親フォルダ作成、段階4=受注詳細の作成ボタン。
  各段階で必ず止まって動作確認する（先走り実装しない）。
- **prod MCP read_only維持**: 段階0で `.mcp.json` の prod を `read_only=true` に戻した（commit `e6a3c67`）。
  prodへの書き込みはSQL Editor手動の既存運用を継続（既知の地雷・台帳修復の方針と一致）。
- **依存ライブラリ**: `googleapis` 単体を採用（`google-auth-library` は内包されるので明示追加しない）。
  Node runtime の route handler に閉じ込めればクライアントバンドルには載らない（バンドルサイズ懸念は実質ゼロ）。
  将来削りたければ `@googleapis/drive` サブパッケージに差し替え可。**段階1で `npm i googleapis` の1行のみ。**
- **スコープ**: `drive.file`（アプリが作成・開いたファイルのみ）。Drive全体権限は要求しない最小権限。
- **リダイレクトURIパス確定（重要）**: `/api/google/oauth/callback` で確定（変更なし）。
  段階2でこのパスにコールバックroute handlerを実装する前提。Google Cloud Console の承認済みリダイレクトURIには
  dev/prod両方を登録: `http://localhost:3000/api/google/oauth/callback` と
  `https://app.hiiragi-tech.app/api/google/oauth/callback`。完全一致照合のため両方必須。
- **必要なenv**（`.env.local`・dev値、prodはVercel環境変数）: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` /
  `GOOGLE_REDIRECT_URI`。`GOOGLE_REDIRECT_URI`は環境ごとに1値（dev=localhost、prod=appドメイン）。
- **小野寺さんのConsole手作業（段階1着手の前提条件）**: ①Google Drive API有効化 ②OAuth同意画面（External/
  `drive.file`スコープ/自分をテストユーザー登録・当面「テスト」状態） ③OAuthクライアントID（Webアプリ）作成と
  上記リダイレクトURI両方の登録→Client ID/Secretを`.env.local`へ。**この作業完了の連絡を待ってから段階1に進む。**

### 2026-06-09 ── 業販対応 段2 明細の見せ方（設計確定・実装は次回）

- **個人明細**: 内容 / 数量 / 単価 / 小計（「工賃/部品代」の2列を「単価」1列に統合）。
- **法人明細**: 内容 / 数量 / 単価 / 業販 / 参考定価。
  - 単価 = 業販の単価（1個あたり）
  - 業販 = 業販の単価 × 数量（行の合計）
  - 参考定価 = 定価の単価 × 数量（行の合計）
  - **粒度が混在する**（単価=1個、業販/参考定価=合計）のは意図的。
    理由: 業者は1個単価も見たいが、商売判断には「業販の合計 vs 定価の合計」の対比が重要
    （業者は仕入れた部品をエンド客に参考定価で請求することがあるため、定価合計を知りたい）。
  - **掛け率は画面に出さない**（裏方）。
- **法人の合計欄**: 業販の税込合計 ＋ **参考定価の税込合計を併記**。
  → calculateTotals に「参考定価の合計」を新規追加（既存の業販合計＝unit_priceベースは不変）。
- **定価の保持**: OrderItem と ItemRow に `list_price?: number | null` 追加（jsonb・マイグレ不要）。
  rowFromPart=variant.list_price、rowFromMenu=default_unit_price を埋める。
  過去明細（list_price無し）は法人モードで定価欄を空にフォールバック（スナップショット保護の方針）。
- **文言**: 画面の「工賃」「部品代」→「単価」に統一。PDFの文言は段2-2で帳票影響を見て判断。
- **刻み方**: 段2-1=明細画面（今回設計）、段2-2=PDF 2ファイル（次回・取引先帳票なので画面確定後に着手）。
- **計算**: 個人の小計・合計は不変。法人は業販がunit_priceに入る既存実装で合計も正しい。
  追加は「参考定価の税込合計」のみ。

### 2026-06-09 ── メニューの単機能化／部品在庫への一本化（方向確定・実装は次回）

- **発端**: 業販対応の掛け率設計を詰める中で、小野寺さんが「1メニューに工賃と部品代が同居すると混乱する」と気づいた。
  さらに「部品在庫と作業メニュー（の部品機能）は本質的に同じものでは？」という核心的な発見に至った。
- **過去設計の確認**: 旧設計では「1メニュー＝1部品 or 工賃のみ」とし、部品もメニュー化して
  linked_part_id で部品在庫にリンクする二重構造だった（部品が「部品在庫」と「部品メニュー」の2箇所に出る）。
  これが混乱の元。
- **確定した方向（実装は次回）**:
  - **部品は「部品在庫」に一本化**。在庫・車種別定価(list_price)・掛け率(markup_rate)を持つ。受注では「部品在庫から追加」で呼ぶ。
  - **作業メニューは「部品以外の、名前のついた金額項目」**に。売値・原価・掛け率を1つずつ持つ。
    「工賃」という固定概念は持たない（工賃でも技術料でも、要は部品以外の費目）。
    1メニュー＝1金額。工賃/部品代の二重構造を廃止。
  - **セットは中身（メニュー＋部品）を束ねるショートカット**（金額は持たず参照のみ）。
  - 掛け率は第二歩-1で足した markup_rate 1本がそのまま機能（メニューが単一項目なので1本で足りる）。
  - 粗利は「メニューの売値−原価」で従来どおり出る。工賃/部品の内訳集計は実務で使っていないため不要。
- **移行影響（調査済み 2026-06-09）**: prod（ヒデヨシさんのデータ）には「両方あり」メニューが0件・全2件が工賃のみ。
  セット未使用・linked_part_id未使用・車検系メニュー0件。**本番データの移行は不要、コードのみで完結見込み**。
  dev には小野寺さんのテストメニュー（両方あり2件・部品代のみ1件）あり＝dev内で作り直せばよい（本番影響なし）。
- **なぜ今夜実装しないか**: この変更は集計・PDF・明細・既存データ・利益エンジンの広範囲に関わる。
  「データ構造を決める変更は速さより方向。焦らず育てる」の原則に従い、影響範囲を次回ちゃんと調査してから実装する。
- **業販対応との関係**: この単機能化が済むと、メニューの業販対応（2-2aのメニュー部分）が
  「メニュー＝単一項目に掛け率1本」で素直に直せる。だから単機能化を先に片付けてから業販対応の続きに戻る。

### 2026-06-08 ── 業販対応：顧客区分で明細の見せ方を変える（構想確定・実装これから）

- **背景**: 小野寺さんは過去にGASで「顧客を法人/個人で区分→明細の見せ方を変える」業務をしていた。
  現HIIRAGIにそれが無く、日々の業務で戸惑いがある。「ゆっくりでも実装したい」＝次にやること。
- **核心**: 法人（業者）相手は「定価を見せて、掛け後の業販価格で請求」。個人相手は「売価ひとつだけ」。
  相手が何を知りたいかが違う（法人=定価と卸値の両方、個人=払う額だけ）。
- **確定した設計**:
  - 顧客に「法人/個人」の区分を持たせる（これが全ての起点・第一歩）。
  - 明細の列を顧客区分で変える（**列数は揃えない**。過去GASの「列数固定」はスプレッドシートの制約だった。アプリなら自由）。
    - 法人: 数量 / 単価 / 業販 / 定価（4列）
    - 個人: 数量 / 単価 / 小計（3列）。定価も業販も見せない（個人への売価は1つでいい）。
  - 業販価格の入力: **掛け率を入れたら自動計算（定価×率）、その値を手で上書きも可**。率は行ごとに自由。
    掛け率は固定でない（工賃70〜80%、部品80〜100%等）ので、自動計算は「たたき台」、最終は手で調整。
  - 「備考」を明細列にはしない（既存の「+補足」欄と役割がダブるため）。
- **流用できる土台（既存）**: 車種別定価の `list_price` が「定価」に、既存の売価（parts_cost）が「単価」に使える。
  Step 3で作ったものがそのまま生きる。新規に要るのは「顧客区分」「業販価格の置き場所」「区分での見せ方切替」。
- **スコープ**: 受注・顧客・明細・PDF横断の大きな改修。Step3と同様に刻んで進める。
  第一歩=顧客の法人/個人区分（DB+登録UI）。これが無いと見せ方の切替ができない。

### 2026-06-04 ── 部品は「2階建て」構造（在庫＝1階／請求カタログ＝2階）★利益設計の核心

- **発見**: 同じ物理部品（例: 43/47/15のフロントフォークブッシュ）でも、**車両の車種ごと**に
  純正パーツリストの品番・定価が異なる（例: GSX-R1000で取れば安い、Vストローム1000だと高い）。
  仕入れは一番安い品番で行い、請求はその車の車種の純正定価で行うことで、差額が利益になる。
  これはHIIRAGIの利益エンジンそのもの。
- **構造の整理**:
  - **1階（在庫・自分が管理する単位）**: 寸法で1部品。棚に1種類。一番安いソースで仕入れる。在庫はここで数える。
  - **2階（請求カタログ・客に見せる単位）**: 同じ実体に車種別の品番＋定価がぶら下がる。
- **決定（在庫を割らない）**: `parts_inventory` は寸法で1行のまま（1行＝1在庫）。
  「同じ部品をメーカー別に複数行登録」はしない。在庫が割れて確保/消費の整合が壊れるため。
- **顧客への見せ方（名前）**: 在庫の `name` は寸法を含めない汎用名。請求時の車種別の見せ方は
  明細追加時に編集（Step 1で部品名・価格は編集可能にしてある）。将来は車種別定価で自動化（Step 3）。
- **当面の運用**: 2階（車種別品番・定価）はGoogleスプレッドシートで継続管理・充実させる。
  アプリには1階（在庫）だけ載せ、請求額はスプレッドシートを見て手打ち。
  → スプレッドシートが「車種別定価が実際どう増えるか」の実験場になり、Step 3の設計精度が上がる。

### 2026-06-04 ── 「自分で先に試す」を、特別扱いの分岐なしで実現する方針

- **小野寺の希望**: スピード重視。新機能はまず自分(info@)で試し、良ければ全ユーザーに開放したい。
- **決定**: 「info@のときだけ動く」というアカウント分岐は作らない。代わりに
  「機能は全員に存在するが、データを登録した人だけ使える」設計にする。
  → コードは全員共通のまま、最初に使うのは自分だけ、という状態が自然に成立する。
- **なぜ**: メールアドレスでの分岐は脆く（メール変更で壊れる）、後で広めるとき改修が必要になり、
  かえってスピードを落とす。「データの有無で出し分け」なら広めるときに改修ゼロ。
- **スピードの種類を区別**: 影響範囲が明確で後戻りできる変更は大胆に速く（Step 1・2のように）。
  一方、データ構造を決める変更（車種をどう持つか等）は速さより方向が大事。急がば回れ。

### 2026-06-04 ── 在庫モデル：2段階（確保→消費）に決定

- **決定**: 在庫の出入りを「受注ステータス連動の自動」に一本化する。
  - 見積 `estimate_status` → **了承済** で **確保**（`reserved_quantity +=`）
  - 作業 `work_status` → **完了** で **消費**（`stock_quantity -=`、確保があれば振替）
  - 各ステータスを戻すと自動で解除／取消（reserved_at / consumed_at で状態管理）
- **なぜ**: 「作業しようとしたら部品が無い」を防ぎたい（＝了承時点で確保したい）が、
  現実に棚から減るのは作業完了時。この業務実感に1対1で対応する。
- **操作は増やさない**: ボタンを足さず、ステータスを進めるだけで裏で在庫が動く設計。

### 2026-06-04 ── 受注の手動「在庫を引く」ボタンを引退

- **決定**: 受注詳細の手動在庫引きUI（StockDeductionSection）を非表示化。
  在庫移動はステータス連動に一本化。
- **なぜ**: Step 2で自動化されるため手動は不要に。本番で手動引き実績ゼロ＝移行リスクなし。
  「在庫を減らす蛇口」が手動・自動の2本あると二重引きの事故源になるため、1本に統一。
- **慎重策**: いきなり削除せず「UIから到達不能にする＋RPCは残置」。問題時のロールバック保険。
- **棚卸（adjustStock）・入庫（registerStockIn）は据え置き**。これらは在庫引きとは別機能で、
  自動化後はむしろ現実とのズレを直す安全弁として重要。

### 2026-06-04 ── 確保/消費の記録方式

- **決定**: `orders` に `reserved_at` / `consumed_at`（日時2本）を追加して状態管理。
  確保量は `stock_movements` 台帳に `reserve` / `release` 種別を追加して記録。
  在庫操作は原子的RPC（4本）で1トランザクション化。
- **なぜ**: 既存の `stock_deducted_at` と同じ流儀（日時null=未到達）で作法を揃える。
  台帳記録なら「確保した時点で何をいくつ押さえたか」が後の明細編集に影響されず残る。

### 2026-06-04 ── 部品の品番管理（アプリ改変なし）

- **決定**: フロントフォーク部品の「同寸法で複数品番が使い回せる」調達カタログは
  Googleスプレッドシートで継続管理。HIIRAGIには持ち込まない。
  HIIRAGIの `parts_inventory` には **寸法（使い回しの単位）で1部品** を登録する。
- **欄の使い分け**:
  - `name` = 顧客向け表示名（寸法を含めない。例「Φ43 ガイドブッシュ アウター」）
  - `internal_code` = 社内管理コード（寸法をそのまま。例「GB-OUT-43-47-15」）※PDF非表示
  - `external_code` = 代表メーカー品番、`memo` = 他品番・廃番代替
  - `cost_price` = 安いソースの仕入値、`sale_price` = 請求定価
- **なぜ**: PDFに出るのは `name` だけ。寸法を `internal_code` に素直に入れれば
  「自分は寸法で管理、客には非開示」が暗号化なしで成立する。

---

## 5. 既知の地雷・注意点（ハマりどころ）

- **【最重要・要対応】マイグレーション台帳が壊れている（dev/prod両方）**: 2026-06-04夜にprod接続で確認。
  記録簿（`supabase_migrations.schema_migrations`）と実体DBが大きく乖離している。
  - 台帳登録件数: **dev 24本 / prod 4本**。だが実体スキーマはdev/prodともほぼ全部入っている（SQL Editor直叩きの蓄積）。
  - 本番には24本相当のDDLが実際に効いているのに、台帳には4本しか記録されていない。
  - **危険**: 今後 `supabase db push` を打つと、台帳上「未適用」のDDLを再実行しようとし、エラー/上書き/破壊の恐れ大。
    → 現状 `db push` 運用は事実上不可能。
  - **方針決定（2026-06-07）**: 過去を完璧に清算するより「今後 db push で安全に足せる状態」を作るのが目標。
    repair（台帳に行を足すだけ・SQL本体は再実行しない。`statements` を空配列 `'{}'::text[]` で INSERT）を段階的に実施する。
  - **修復の進捗**:
    - ✅ 第1段階（2026-06-07完了）: 6/4の3本（drop_legacy_id_triggers / add_reserved_quantity_to_parts /
      status_linked_reserve_consume）を dev/prod 両方の台帳に登録。dev=MCP直INSERT、prod=SQL Editor手動INSERT。
      スキーマ実体は不変を確認。dev 24→27本、prod 4→7本。
    - ✅ 第2段階（2026-06-07完了）: ファイルF01〜F12のうち重複しない11本（F06/F13を除く）を prod 台帳に
      SQL Editor手動INSERTで登録。prod 7→18本。スキーマ実体は不変。これでリポジトリのファイルが
      （F06/F13の重複2本を除き）prod台帳と整合 → 今後 db push で新規マイグレーションを安全に足せる状態になった。
    - ⬜ 第3段階（やる/やらない要判断・急がない）: F06/F13の重複解消（prodに別timestampで二重記録あり）、
      dev側のtimestampズレ解消、孤児レコード整理。実害は薄いので後回し可。
      F06/F13の整理案: (i)prod古いversionをDELETE→ファイルversionでINSERT (ii)ファイル側をprod既存versionにリネーム (iii)放置。
  - **prodへの台帳書き込みは SQL Editor 手動で行う**: prod MCPは `read_only=true` を維持（誤爆防止）。
    書き込みが必要な操作はブラウザのSQL Editorで一度きり実行する運用。
  - 補足: `create_subscriptions` は dev(20260530162846)/prod(20260530162608) で version timestamp が異なり、同名でも別物扱い。
  - ⚠️ 別件: `create_shop_assets_bucket` は台帳にあるが dev/prod とも実体（バケット）が無い。画像保存機能が依存していないか別途要確認。
- **【棚卸し】prod未反映オブジェクトの全体確認（2026-06-20時点）**:
  マイページ障害を受けて、コードが参照するDBオブジェクト（全 `.from()`／`.rpc()`／`lib/types.ts`型）を
  prodで実体ベースに確認した結果。
  - **【解消済】mypage関連**（`mypage_token`/`mypage_expires_at`列・部分UNIQUE index・`mypage_get_by_token`関数）
    → 本日prod適用完了。関数EXECUTEはservice_roleのみでdev一致。
  - **【解消済・2026-06-20】`subscriptions.stripe_customer_id` / `stripe_subscription_id` の2列をprod適用**。
    - `20260531120000_add_stripe_to_subscriptions` 相当をprod SQL Editorで手動適用（列2＋部分UNIQUE index2＋台帳登録）。
      検証（columns_ok/indexes_ok/ledger_ok）すべて true。これでWebhook受信/ポータル表示時の42703（column does not exist）リスクは解消。
    - service_roleのGRANTは追加不要だった：prodは既にACL=`arwdDxtm`（Supabaseベースライン付与）で
      `20260531140000_grant_subscriptions_to_service_role` は機能的に不要。台帳にも登録していない（実体が既にあるため）。
  - **【要対応・別タスク】prod の anon 権限が dev と異なる（2026-06-20発見）**：
    - prod の `subscriptions` で `anon` ロールに full DML（ACL=`arwdDxtm`）が付いたまま。dev は `Dxtm` に絞り済み（read/write剥奪）。
    - 現状：RLS有効＋anon向けポリシー無し＋`auth.uid()=null` のため実害は無い（読めalso書けない）。
    - ただし dev で行ったハードニングが prod に未適用。将来の保険として prod の anon を dev同様に絞るべき。
      今回のStripe土台スコープからは外し、別タスクとして記録。
    - 他テーブルでも同様の anon 権限差がないか、是正時にあわせて確認すること。
  - **【問題なし】上記以外でコードが参照するテーブル・カラム・RPC関数はすべてprodに実在を確認**
    （`orders.drive_folder_id`・`customers.customer_type`・`parts_inventory_variants.markup_rate`・
    在庫系RPC `deduct/consume/reserve/release/reverse/unconsume_order_stock`・`google_integrations`列一式 等）。
    今回のような「即落ち」リスクはStripe以外に検出されず。
  - **【参考】dev/prodスキーマ乖離の認識**: prodには現行コードが参照しないレガシー列・テーブルが多数残存
    （`orders.order_number`/`qr_url`/`labor_total`/`shaken_jibai` 等の旧列、`products`/`users`テーブル等）。
    これらは障害源ではない（prodが「多い」方向の差分）が、dev/prodのスキーマが歴史的に乖離している事実は
    今後のmigration設計時に留意する。
- **【要対応・Stripe本番化の残タスク】土台（prod stripe列）は完了。以下が未対応（2026-06-20時点）**：
  - **アクセス制御が未実装（最重要・本番課金前に必須）**：トライアル切れ・`status=suspended`・未課金時の
    機能ロックが無い。`app/dashboard/layout.tsx` は authチェックのみで subscription を見ていない。
    → **suspended でも全機能が使える状態**。Webhookは解約/未払いで `suspended` に倒すが、誰も読んでいない。
  - **本番モード設定（Vercel環境変数）**：live キー（`sk_live`/`pk_live`）・本番price ID・
    本番Webhookエンドポイント（`https://app.hiiragi-tech.app/api/stripe/webhook`）登録・
    本番 `STRIPE_WEBHOOK_SECRET`・本番 `NEXT_PUBLIC_SITE_URL` を設定。
  - **本番price作成**：Stripe本番モードで商品の価格を作成。**マイページオプションは580円に**（旧テストは980円）。
  - **`billing-form.tsx` のハードコード金額（¥1,980/¥980）を本番priceと一致させる**（980→580の修正含む）。
- **【確認済み・良好】受注明細リニューアル（Step1/2）は prod にも実体が揃っている**: 2026-06-04夜に確認。
  `reserved_at`/`consumed_at`/`reserved_quantity`/`related_order_text_id`、RPC6本、movement_type CHECK、
  レガシートリガ削除、RLS/PK構成、すべて dev/prod 一致。在庫・受注まわりは本番健全。
- **【要確認】prod の create_default_subscription トリガ**: prod台帳に `revoke_..._execute` があり EXECUTE権限は剥奪
  された形跡だが、トリガ本体（新規ユーザ作成時の自動INSERT）は dev/prod とも生きている。意図通りか中途半端か要確認。
- **【解消済み】Stripeブランチ（stripe-保存_0604）のマージ衝突**: 2026-06-17 に main へマージ完了（merge commit `08f8b1e`）。
  事前に origin 最新（Googleドライブ連携入り）を rebase で取り込んだ結果、実際の衝突は **`.mcp.json` 1ファイルのみ**で済んだ
  （事前予想していた orders系・`ensure.ts`・6/4の3マイグレの衝突は全て auto-merge で吸収された）。
  `.mcp.json` は main側の `read_only=true` を採用（prod誤爆防止）。`npm run build` も一発通過。
  参考: backupタグ `backup-before-stripe-merge`=`b853f87` を残置（万一の戻し用）。
- **`docs/原価粗利在庫管理_設計書.md` は歴史的資料（古い）**: 2026-05-22作成。Step1〜5は実装済みの「元ネタ」。
  この設計書の「在庫の引当2段階はやらない」という記述は**古く、今は逆**（DECISIONSで2段階reserve→consumeに決定済み）。
  惑わされないこと。Step6（月次粗利レポート）・Step7（棚卸し履歴UI）は未着手の可能性。設計書は 2026-06-17 の Stripe マージで main にも取り込まれた（`docs/原価粗利在庫管理_設計書.md`）。
- **旧 `deduct_order_stock` は型不整合で元々動いていなかった**: `orders.id` は text だが
  既存 `stock_movements.related_order_id` は uuid。Step 2で `related_order_text_id`(text) を
  追加して解決。過去「在庫引きが効いていない」前提で考えること。
- **明細は `orders.items`（jsonb・DB-FK無し）**: 部品は `linked_part_id` による論理参照のみ。
  部品は物理削除せずソフトデリート（`deleted_at`）運用（参照孤立を防ぐため）。
- **確保/消費済み受注の明細編集**: 自動差分はしない。編集時は一度ステータスを戻して→直す
  （ItemsFormが警告バナーで案内）。
- **旧 `type`/`tax_free` と新 `tax_category`/`item_category_id` が並走**: 計算ロジックは
  まだ旧フィールド依存の箇所あり（Step 6-2相当が未完）。金額・粗利ロジックを触るときは要確認。
- **【次テーマ】受注フロー：請求済→入金済の動線が一手間**: `invoice_status=請求済` にすると受注がアーカイブへ
  移動し、その後「入金済」にする操作が一手間増える。当初は意図した設計だが、マイページ動作確認中の実操作で
  「請求済→入金済」の動線が面倒と判明。設計見直しを検討（当時アーカイブ送りにした理由を確認してから）。
  マイページとは独立した受注管理の改善テーマ。
- **ローカルfeatブランチが大量残存**: feat/* が多数。多くはmainマージ済みのはずだが未整理。いつか棚卸しして削除を。
- **複数チャット並行によるマージ混乱に注意**: 作業前にこのドキュメントとコードの現状を確認。

---

## 6. 作業ログ（時系列・追記型）

> 各チャットの作業終了時に1エントリ追記。形式: 日付 / チャット / 内容 / commit。

- **2026-06-04** ｜ 明細リニューアル ｜ Step 1 実装（部品在庫から明細に追加・reserved_quantity列追加） ｜ commit `a60e1bf`
- **2026-06-04** ｜ 明細リニューアル ｜ Step 2 実装（ステータス連動の確保/消費・手動UI引退・RPC4本） ｜ commit `2a7fec8`
- **2026-06-04** ｜ 明細リニューアル ｜ Step 2 dev実値検証 完了（二重引きなし・ロールバック動作を確認。UI表層目視のみ任意で残） ｜ 検証のみ・コード変更なし
- **2026-06-04（夜）** ｜ 全体把握 ｜ 家PCのStripe作業を `stripe-保存_0604`（commit 8e6ad48）に退避保存→main同期→DECISIONS.mdをリポジトリに配置（commit 1db3982）→リポジトリ全体を棚卸しし本ドキュメントに全戦線・地雷を反映 ｜ commit 1db3982 ほか
- **2026-06-04（夜）** ｜ 全体把握 ｜ prod用MCPを read_only=true で `.mcp.json` に追加→dev/prodスキーマ差異を棚卸し。受注明細(Step1/2)はprodも実体一致で健全と確認。明確な欠落はStripe2カラムのみ。最大の地雷=マイグレーション台帳の乖離が判明 ｜ 調査のみ・コード変更なし（.mcp.jsonのみ編集） |
- **2026-06-05〜07** ｜ Step 3構想 ｜ 車種別定価のデータ構造を設計確定（部品1行に「品番＋定価＋適合車種タグ」の組を複数ぶら下げる／在庫は割らない／車種は正確入力前提＋軽いゆれ吸収・サジェスト、車種マスターは当面作らない／測定値等はスプレッドシートに任せる）。ロードマップに反映 ｜ 構想のみ・実装なし
- **2026-06-07** ｜ 台帳修復 ｜ 第1段階完了。6/4の3本をdev/prod両台帳に登録（statements空でSQL再実行なし）。dev=MCP直INSERT、prod=SQL Editor手動。スキーマ不変を確認。db push正常化に向けた第一歩 ｜ 台帳のみ・スキーマ変更なし
- **2026-06-07** ｜ 台帳修復 ｜ 第2段階完了。F01〜F12の重複しない11本をprod台帳にSQL Editor手動INSERT。prod 7→18本でリポジトリと整合。今後db pushで新規マイグレを安全に足せる状態に。残=F06/F13重複・dev側ズレ・孤児（第3段階・急がない） ｜ 台帳のみ・スキーマ変更なし
- **2026-06-07** ｜ Step 3-1 ｜ 車種別定価テーブル `parts_inventory_variants`（案A：品番＋定価＋vehicle_tags配列／GIN索引／RLS4／part_id・user_id CASCADE）を新設。dev=MCPでDDL＋台帳INSERTを原子適用、prod=SQL Editor手動。台帳もセット登録（dev28本/prod19本）。既存ズレには不干渉。lib/types.tsにPartsInventoryVariant追加。ファイル=supabase/migrations/20260607000000_create_parts_inventory_variants.sql ｜ 加算的（新テーブル1つ）
- **2026-06-07** ｜ Step 3-2a ｜ variant登録・編集UI実装（部品編集ページに「車種別定価」セクション同居・編集時のみ表示／一覧＋追加／車種タグはチップ入力Enter/カンマ確定・JSON送信／品番・定価・タグの3フィールドMVP／個別即保存）。新規=variants-actions.ts, variants-section.tsx、修正=[id]/edit/page.tsx。DB変更なし（3-1で適用済）。commit 6b5fab5で本番反映 ｜ コードのみ
- **2026-06-07** ｜ Step 3-2b ｜ 明細への車種別呼び出し。受注の車両modelとvehicle_tagsを正規化完全一致で照合→⭐＋「車種別¥定価」表示→選ぶとparts_costに定価反映（品番は明細非表示）。打ち消し線は出さない。normalizeForVehicleMatch追加（記号/大小/全半角吸収）。page.tsxでvariants並列取得しItemsFormにvehicle/allVariants渡す。OrderItem不変。本番で稼働確認済み。利益エンジン初回転 ｜ コードのみ
- **2026-06-07** ｜ 入力欄UX改善 ｜ ①数量入力を全7箇所step=1（矢印は1ずつ・小数は手入力可、inputMode維持）②金額のデフォルト0を空(−)に（値引/預り金/作業メニュー各定価。共通ヘルパー lib/forms/money-default.ts=0/null/負は空・正のみ表示）③部品原価はrequired解除＋空保存時confirm。計算・DB・保存ロジックは不変。commit ec68d93で本番反映 ｜ コードのみ
- **2026-06-08** ｜ 業販対応 第一歩 ｜ 顧客に法人/個人区分を実装。`customers.customer_type`（text・CHECK personal/business・DEFAULT personal・NOT NULL）。prodに死蔵していた同名列を再利用・完成（過去に作りかけ放置していたもの）。既存13件はpersonalにバックフィル。dev=MCP原子適用（台帳28→29）、prod=SQL Editor手動（台帳19→20）。customer-form.tsxに区分セレクト追加、actions.ts/types.ts更新。ファイル=supabase/migrations/20260608000000_add_customer_type.sql ｜ 加算的（1カラム）
- **2026-06-09** ｜ 業販対応 第二歩-1 ｜ 掛け率をマスターに追加。`parts_inventory_variants.markup_rate`＋`work_menu_items.markup_rate`（numeric NULL・CHECKなし＝120%等許容）。**保存は掛け率（小数）のみ、業販価格はDB非保存＝定価×掛け率で計算表示**（定価値上げ時は掛け率で追従）。掛け率↔業販の双方向入力UI（PriceMarkupGroup共通コンポーネント）をvariants-section/work-menu-formに追加。dev=MCP原子適用（台帳29→30）、prod=SQL Editor手動（台帳20→21）。ファイル=supabase/migrations/20260609000000_add_markup_rate.sql ｜ 加算的（2カラム） | （variantに持たせ部品本体には持たせない＝定価がvariant単位で違うため。工賃と部品は別々の掛け率＝単品に付く） |
- **2026-06-09** ｜ 業販対応2-2a＋メニュー単機能化 段1（本番反映） ｜ ①2-2a: 法人受注で部品/メニューを呼ぶと業販価格（定価×掛け率）が明細に入る。isBusinessをrowFromPart/rowFromMenuに渡し分岐。PartPickerModalに法人時「業販¥」表示。②メニュー単機能化 段1: メニューを「1金額の項目」に。work-menu-formを金額1・原価1・掛け率1・数量に簡略化（工賃/部品代2欄・部品リンクUI撤去）。default_unit_priceを売値に再利用、旧カラム（default_labor_cost等）はtoLegacyCompatで後方互換埋め（labor=売値/parts=0、DROPは段2）。markup_rateの意味を「工賃用」→「メニュー売値全体」に変更。rowFromMenuは売値をlabor_costスロットに暫定投入（段2で金額1列に統合）。DB/PDF不変。4ファイル（items-form/page/work-menu-form/work-menus-actions） ｜ コードのみ
- **2026-06-09** ｜ メニュー設計 方向確定 ｜ 「部品は部品在庫に一本化／メニューは部品以外の金額項目に単機能化／工賃概念を持たない」方向を確定（意思決定ログ参照）。本番移行不要を調査で確認 ｜ 記録のみ
- **2026-06-09** ｜ 業販対応 段2-1（本番反映） ｜ 明細画面を業販対応の最終形に。個人=内容/数量/単価/小計（工賃・部品代の2列を単価1列に統合）、法人=単価/業販(行合計)/参考定価(行合計)。OrderItem/ItemRowに`list_price`（1個あたり定価）追加（jsonb・マイグレ不要）。rowFromPart=variant.list_price、rowFromMenu=default_unit_priceで埋める。合計欄に法人時のみ「参考定価合計（税込）」併記＝`calculateListPriceTotals`新設（既存のcalculateTotals/calculateProfitは完全不変）。単価を常時編集可に統一。過去明細（list_price無し）は法人モードで参考定価「—」フォールバック。個人の計算は完全一致を本番確認。掛け率は画面非表示。4ファイル（types/totals/orders-actions/items-form）。DB・PDF不変 ｜ コードのみ
- **2026-06-09** ｜ 業販対応 段2-2（本番反映＝業販対応 完成） ｜ PDF（請求書・見積書）を個人/法人で出し分け。印刷用printable-document.tsxとreact-pdf InvoiceDocument.tsxを同時改修。個人=品名/数量/単価/小計、法人=品名/数量/単価/業販/参考定価。列幅%を両ファイルで統一（法人=46/8/14/16/16）。合計欄に法人時「参考定価合計（税込）」併記（calculateListPriceTotals流用）。「工賃/部品代」→「単価」に統一。react-pdfのヘッダ固定バグ（常に工賃/部品代表示）も修正。本番で個人/法人PDF実物確認OK。**これで業販対応が顧客区分→PDFまで全通し・完成** ｜ コードのみ
- **2026-06-09** ｜ 次テーマ ｜ PDF複数ページのテーブルヘッダ繰り返し（2ページ目以降に品名/数量/単価等の見出しが出ず読みづらい）。印刷用=thead繰り返し、react-pdf=fixed属性。業販対応とは独立した改善 ｜ 着手予定
- **2026-06-17** ｜ Stripe統合＋マイページ設計 ｜ `stripe-保存_0604` をmainにマージ（衝突は `.mcp.json` のみ・build通過・push済 `08f8b1e`）。マイページはURLトークン/案件ごと/45日/`invoice_status` 連動/PDF非貼付/案A表示で設計確定、実装は次回 ｜ commit対象：DECISIONS.md
- **2026-06-18** ｜ マイページ実装 ｜ お客様マイページをStep1〜4でdev実装・動作確認完了。Step1=DB（`orders`に`mypage_token`/`mypage_expires_at`＋部分ユニークIdx・`20260618000000`）、Step2=発行/再発行/失効アクション＋受注詳細・一覧の発行UI、Step3=公開表示ページ `app/mypage/[token]/`（検証層`lib/mypage/load.ts`と表示層`MypageView`を分離・ステータス連動）、Step4=課金ゲーティング（`lib/entitlements.ts`・UI＋アクション両ガード・管理者バイパス）。dev確認中に「service_role直読みで42501→not_found」を発見し、案B（SECURITY DEFINER関数 `mypage_get_by_token`・`20260618010000`）で最小権限読み取りに変更＋loaderのerrorログ化。公開ルートのため `lib/supabase/proxy.ts` に `/mypage` を未認証許可で追加 ｜ DBマイグレ2本（dev適用済・prod未反映）＋コード
- **2026-06-20** ｜ マイページ本番障害復旧＋prod反映漏れ棚卸し ｜ 別チャットで本番受注一覧が「column orders.mypage_token does not exist」で全滅する障害が発生。原因はコード（6/18本番デプロイ済）が`mypage_token`を参照するのにprod DBへmigration2本が未適用だったこと。対応＝`20260618000000`+`20260618010000`をSQL Editorで単一トランザクション手動適用→列2・index・関数・台帳2件・関数EXECUTE（service_roleのみ）をprodで検証し復旧確認。あわせてコード参照DBオブジェクトをprod実体ベースで全棚卸し→残る欠落は`subscriptions`のStripe2列のみ（黄・Stripe本番稼働前に要適用）、他は全て実在。prod MCPはread_only維持・書込は手動SQL ｜ prod DB手動適用（mypage2本）＋DECISIONS.md記録（コード変更なし）
- **2026-06-20** ｜ Stripe本番化 着手・土台prod反映 ｜ Stripe本番化に向け、まず`subscriptions`のStripe2列をprodへ適用（`20260531120000_add_stripe_to_subscriptions`相当）。SQL Editorで単一トランザクション手動適用＝`stripe_customer_id`/`stripe_subscription_id`列＋部分ユニークindex2本＋台帳`20260531120000`登録。検証（columns_ok/indexes_ok/ledger_ok）すべてtrueで完了。prod確認でservice_roleのDML権限は既に充足（ACL=`arwdDxtm`）＝GRANT migration（`20260531140000`）は機能的に不要と判明、anon権限差（prod=`arwdDxtm`／dev=`Dxtm`・RLSで実害なし）は別タスクとして記録。土台のみ完了でStripeは未本番稼働（liveキー・本番Webhook・本番price・アクセス制御が残・§5にリスト化） ｜ prod DB手動適用（stripe2列）＋DECISIONS.md記録（コード変更なし）
- （以降追記）
