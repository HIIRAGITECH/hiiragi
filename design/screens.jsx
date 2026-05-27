// screens.jsx — 残りの画面群 (顧客 / 受注詳細 / 入金 / 売上 / 部品 / 設定)
// 紺青配色 (.palette-slate) で表示する想定。 すべて Sidebar2 を使う。

// ===== 共通ヘルパー (shell2.jsx から借用済み) ============================
// yen2, daysAgo2, statusClass, StatusDot, Sidebar2, PageHead2

// ===== 共通: 画面ヘッダー (サイドバー右側のページ上部) ====================
function ScreenHead({ crumbs, title, gloss, actions }) {
  return (
    <div style={{
      padding: '22px 32px',
      borderBottom: '1px solid var(--color-line)',
      background: 'var(--color-paper)',
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
      flexShrink: 0,
    }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        {crumbs && <div style={{ fontSize: 12, color: 'var(--color-ink-light)', letterSpacing: '0.12em', marginBottom: 6 }}>{crumbs}</div>}
        <h2 style={{ margin: 0, fontFamily: 'var(--font-jp)', fontWeight: 600, fontSize: 26, color: 'var(--color-ink)', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>{title}</h2>
        {gloss && <div style={{ marginTop: 6, fontSize: 13, color: 'var(--color-ink-mid)', letterSpacing: '0.04em' }}>{gloss}</div>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>{actions}</div>}
    </div>
  );
}

// ===== 共通ラッパ (Sidebar + content) ===================================
function AppShell({ active, children }) {
  return (
    <div className="wos-art" style={{ flexDirection: 'row' }}>
      <Sidebar2 active={active} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

// ===== サンプルデータ ===================================================
const CUSTOMERS = [
  { id: 'CUS-00128', name: '山田 太郎',   kana: 'ヤマダ タロウ',     phone: '090-1234-5678', email: 'yamada.t@example.jp',   notes: 'SHOWAフォークOH常連。初期作動性重視。' },
  { id: 'CUS-00127', name: '佐藤 健一',   kana: 'サトウ ケンイチ',    phone: '080-2345-6789', email: 'k.sato@example.jp',     notes: 'サーキット走行、ストローク短縮の相談あり。' },
  { id: 'CUS-00126', name: '田中 美咲',   kana: 'タナカ ミサキ',     phone: '090-3456-7890', email: null,                    notes: '請求は月末締めで対応。' },
  { id: 'CUS-00125', name: '鈴木 大輔',   kana: 'スズキ ダイスケ',    phone: '090-4567-8901', email: 'd.suzuki@example.jp',   notes: 'ÖHLINS常連、ご紹介経由。サーキット仕様。' },
  { id: 'CUS-00124', name: '高橋 一郎',   kana: 'タカハシ イチロウ',  phone: '080-5678-9012', email: null,                    notes: null },
  { id: 'CUS-00123', name: '中村 翔太',   kana: 'ナカムラ ショウタ',  phone: '090-6789-0123', email: 's.nakamura@example.jp', notes: 'DDC不要、ノーマル化希望。' },
  { id: 'CUS-00122', name: '渡辺 慎一',   kana: 'ワタナベ シンイチ',  phone: '080-7890-1234', email: 'watanabe@example.jp',   notes: 'マルゾッキ前期。問い合わせ多め。' },
  { id: 'CUS-00121', name: '木村 拓也',   kana: 'キムラ タクヤ',     phone: '090-8901-2345', email: null,                    notes: null },
];

const VEHICLES_YAMADA = [
  { id: 'VEH-00321', plate: '湘南 し 11-04', maker: 'HONDA', model: 'CBR1000RR-R FIREBLADE SP', year: 2023, vin: 'JH2SC...' },
  { id: 'VEH-00284', plate: '湘南 さ 88-21', maker: 'HONDA', model: 'CBR600RR',                  year: 2018, vin: 'JH2PC...' },
];

const HISTORY_YAMADA = [
  { id: 'ORD-2026-0152', date: '2026/05/24', vehicle: 'CBR1000RR-R',          work: 'SHOWA フロントフォーク OH', total: 286400, inv: '請求済' },
  { id: 'ORD-2026-0098', date: '2026/02/14', vehicle: 'CBR1000RR-R',          work: '12ヶ月点検 + リアショックOH',  total: 198000, inv: '入金済' },
  { id: 'ORD-2025-0421', date: '2025/11/03', vehicle: 'CBR600RR',             work: 'タイヤ交換 + ブレーキフルード', total: 78400,  inv: '入金済' },
  { id: 'ORD-2025-0388', date: '2025/08/22', vehicle: 'CBR1000RR-R',          work: 'シール劣化 緊急修理',          total: 64500,  inv: '入金済' },
];

const ORDER_DETAIL = {
  id: 'ORD-2026-0152',
  date: '2026/05/24',
  work: '作業中', est: '了承済', inv: '請求済',
  due: '2026/06/24',
  notes: 'SHOWA フロントフォークOH。フリクション軽減希望、初期作動性重視。\nオイル番手は次回ご相談。',
  customer: { id: 'CUS-00128', name: '山田 太郎', kana: 'ヤマダ タロウ', phone: '090-1234-5678', address: '神奈川県藤沢市鵠沼海岸 4-12-8' },
  vehicle:  { plate: '湘南 し 11-04', maker: 'HONDA', model: 'CBR1000RR-R FIREBLADE SP', year: 2023, vin: 'JH2SC82A0PM200145' },
  items: [
    { cat: '整備', name: 'SHOWA BFF フロントフォーク オーバーホール', qty: 1, unit: 38000, sub: 38000 },
    { cat: '整備', name: 'シールキット交換 (左右)',                    qty: 2, unit: 8400,  sub: 16800 },
    { cat: '部品', name: 'SHOWA 純正フォークオイル SS-19',              qty: 2, unit: 4200,  sub: 8400  },
    { cat: '部品', name: 'SHOWA シールキット 41Φ',                      qty: 1, unit: 18600, sub: 18600 },
    { cat: '整備', name: '初期作動性 セッティング調整',                 qty: 1, unit: 12000, sub: 12000 },
    { cat: '整備', name: '試乗 + 微調整',                              qty: 1, unit: 8000,  sub: 8000  },
  ],
};

const PAYMENTS = [
  { id: 'ORD-2026-0150', customer: '田中 美咲', invoiced: '2026/05/03', due: '2026/05/15', amount: 318000, status: 'overdue', days: 11 },
  { id: 'ORD-2026-0145', customer: '木村 拓也', invoiced: '2026/05/19', due: '2026/06/02', amount: 372000, status: 'due_soon', days: 6  },
  { id: 'ORD-2026-0152', customer: '山田 太郎', invoiced: '2026/05/24', due: '2026/06/24', amount: 286400, status: 'on_track', days: 28 },
  { id: 'ORD-2026-0143', customer: '小林 義男', invoiced: '2026/05/17', due: '2026/05/31', amount: 142800, status: 'due_soon', days: 4  },
  { id: 'ORD-2026-0140', customer: '伊藤 健太', invoiced: '2026/05/12', due: '2026/05/26', amount: 96400,  status: 'overdue', days: 1  },
  { id: 'ORD-2026-0138', customer: '加藤 直樹', invoiced: '2026/05/10', due: '2026/06/10', amount: 169200, status: 'on_track', days: 14 },
];

const PARTS = [
  { name: 'SHOWA フォークオイル SS-19',      sku: '社内: SHO-OIL-19',   supplier: 'ショウワ商会',  cost: 4200,  sale: 5200,  stock: 12, reorder: 6,  status: 'ok',  detail: true  },
  { name: 'SHOWA シールキット 41Φ',           sku: '社内: SHO-SEL-41',   supplier: 'ショウワ商会',  cost: 18600, sale: 22500, stock: 2,  reorder: 4,  status: 'low', detail: true  },
  { name: 'ÖHLINS シールキット (汎用)',       sku: '社外: OHL-SK-G',    supplier: 'カロッツェリア', cost: 24000, sale: 29800, stock: 0,  reorder: 2,  status: 'out', detail: true  },
  { name: 'KYB シール 36Φ',                  sku: '社内: KYB-SEL-36',   supplier: 'KYBサービス',   cost: 7800,  sale: 9600,  stock: 8,  reorder: 4,  status: 'ok',  detail: true  },
  { name: 'ダストシール (汎用)',              sku: '社内: DUST-G',      supplier: 'カロッツェリア', cost: 1200,  sale: 1800,  stock: 22, reorder: 10, status: 'ok',  detail: true  },
  { name: 'パーツクリーナー 840ml',           sku: null,                supplier: '柳本商店',     cost: 380,   sale: null,  stock: 3,  reorder: 6,  status: 'low', detail: false },
];

const SALES_MONTH = {
  year: 2026, month: 5,
  sales: 2840000,   // 売上
  advance: 580000,  // 前受金
  tax: 284000,      // 消費税
  total: 3704000,   // 請求合計 (税込)
  paid: 1985200,
  paidCount: 18,
  unpaid: 1718800,
  unpaidCount: 5,
  categories: [
    { name: '整備',           sub: 1820000 },
    { name: '車検整備',       sub:  580000 },
    { name: '車検法定費用',    sub:  124000 },
    { name: '部品',           sub:  720000 },
    { name: 'タイヤ',         sub:  140000 },
    { name: '預かり・出張費', sub:   36000 },
  ],
  taxBuckets: { taxable: 3296000, nonTax: 124000, discount: 0 },
  rows: [
    { date: '2026/05/24', id: 'ORD-2026-0152', customer: '山田 太郎', work: '作業中', kind: 'advance', amount: 286400 },
    { date: '2026/05/22', id: 'ORD-2026-0148', customer: '高橋 一郎', work: '作業中', kind: 'advance', amount: 196500 },
    { date: '2026/05/21', id: 'ORD-2026-0147', customer: '中村 翔太', work: '完了',   kind: 'sales',   amount: 240000 },
    { date: '2026/05/19', id: 'ORD-2026-0145', customer: '木村 拓也', work: '作業中', kind: 'advance', amount: 372000 },
    { date: '2026/05/17', id: 'ORD-2026-0143', customer: '小林 義男', work: '完了',   kind: 'sales',   amount: 142800 },
    { date: '2026/05/12', id: 'ORD-2026-0140', customer: '伊藤 健太', work: '完了',   kind: 'sales',   amount:  96400 },
    { date: '2026/05/10', id: 'ORD-2026-0138', customer: '加藤 直樹', work: '完了',   kind: 'sales',   amount: 169200 },
    { date: '2026/05/08', id: 'ORD-2026-0135', customer: '森本 大輔', work: '完了',   kind: 'sales',   amount: 314600 },
  ],
};

const SHOP_INFO = {
  shop_name:       '桜サスペンション 横浜店',
  address:         '神奈川県横浜市中区元町 3-128',
  phone:           '045-664-2840',
  registration_no: 'T1234567890123',
  bank_name:       '横浜銀行',
  branch_name:     '元町支店',
  account_type:    '普通',
  account_number:  '1234567',
  account_holder:  'サクラサスペンションヨコハマテン',
};

// ============================================================
// 1. 顧客一覧
// ============================================================
function CustomersList() {
  return (
    <AppShell active="customers">
      <ScreenHead
        crumbs="顧客管理"
        title="顧客一覧"
        gloss={`登録件数 ${CUSTOMERS.length} 件 / 過去2年で利用のある顧客 6名`}
        actions={<>
          <button className="btn-ghost btn-sm">CSV書き出し</button>
          <button className="btn">新規顧客を登録</button>
        </>}
      />
      <div style={{ padding: '18px 32px', borderBottom: '1px solid var(--color-line)', background: 'var(--color-paper)', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div className="search" style={{ maxWidth: 460 }}>
          <span className="ico">⌕</span>
          <input placeholder="顧客名・フリガナ・電話番号・メモで検索…" />
          <span className="key">⌘ K</span>
        </div>
        <span className="chip active">全顧客 <span className="ct">{CUSTOMERS.length}</span></span>
        <span className="chip">最近の利用 <span className="ct">12</span></span>
        <span className="chip">メモあり <span className="ct">5</span></span>
      </div>
      <div className="body-area" style={{ overflow: 'hidden', padding: '20px 32px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderTop: '1px solid var(--color-line)', borderBottom: '2px solid var(--color-line-strong)', background: 'var(--color-paper)' }}>
              <ThS w="13%">顧客ID</ThS>
              <ThS w="17%">氏名</ThS>
              <ThS w="15%">フリガナ</ThS>
              <ThS w="14%">電話番号</ThS>
              <ThS w="17%">メールアドレス</ThS>
              <ThS>メモ</ThS>
            </tr>
          </thead>
          <tbody>
            {CUSTOMERS.map((c, i) => (
              <tr key={c.id} style={{ borderBottom: '1px solid var(--color-line)', background: i % 2 === 1 ? 'var(--color-paper)' : 'transparent' }}>
                <TdS><span style={{ fontFamily: 'var(--font-num)', fontSize: 13, color: 'var(--color-accent)', fontWeight: 500 }}>{c.id}</span></TdS>
                <TdS><strong style={{ fontWeight: 600, color: 'var(--color-ink)' }}>{c.name} 様</strong></TdS>
                <TdS muted>{c.kana}</TdS>
                <TdS num>{c.phone}</TdS>
                <TdS muted>{c.email || '—'}</TdS>
                <TdS muted>{c.notes ? <span title={c.notes} style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 320 }}>{c.notes}</span> : '—'}</TdS>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

function ThS({ children, w, right }) {
  return <th style={{ padding: '14px 12px', fontFamily: 'var(--font-jp)', fontSize: 12, fontWeight: 600, letterSpacing: '0.14em', color: 'var(--color-ink-mid)', textAlign: right ? 'right' : 'left', width: w }}>{children}</th>;
}
function TdS({ children, right, num, muted }) {
  return <td style={{ padding: '14px 12px', textAlign: right ? 'right' : 'left', fontFamily: num ? 'var(--font-num)' : 'var(--font-jp)', fontSize: 13.5, color: muted ? 'var(--color-ink-mid)' : 'var(--color-ink)', letterSpacing: num ? '-0.005em' : '0.03em', fontVariantNumeric: num ? 'tabular-nums' : 'normal' }}>{children}</td>;
}

Object.assign(window, {
  ScreenHead, AppShell,
  CustomersList,
  ThS, TdS,
  CUSTOMERS, VEHICLES_YAMADA, HISTORY_YAMADA, ORDER_DETAIL,
  PAYMENTS, PARTS, SALES_MONTH, SHOP_INFO,
});
