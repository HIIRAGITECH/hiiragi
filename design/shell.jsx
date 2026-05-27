// shell.jsx — shared chrome (top nav, sidebar, sample data) for Workshop OS variants

const NAV_ITEMS = [
  { jp: '受注', en: 'Orders', key: 'orders' },
  { jp: '顧客', en: 'Customers', key: 'customers' },
  { jp: '入金', en: 'Payments', key: 'payments' },
  { jp: '在庫', en: 'Inventory', key: 'inventory' },
  { jp: '売上', en: 'Sales', key: 'sales' },
  { jp: '設定', en: 'Settings', key: 'settings' },
];

const SIDEBAR_NAV = [
  { group: 'Daily', items: [
    { jp: 'ダッシュボード', en: 'Dashboard', key: 'dashboard' },
    { jp: '受注一覧', en: 'Orders', key: 'orders' },
    { jp: '顧客管理', en: 'Customers', key: 'customers' },
  ]},
  { group: 'Finance', items: [
    { jp: '入金管理', en: 'Payments', key: 'payments' },
    { jp: '売上集計', en: 'Sales', key: 'sales' },
  ]},
  { group: 'Workshop', items: [
    { jp: '作業メニュー', en: 'Work menus', key: 'work-menus' },
    { jp: '作業セット', en: 'Work sets', key: 'work-sets' },
    { jp: '部品在庫', en: 'Parts', key: 'parts' },
  ]},
  { group: 'System', items: [
    { jp: '設定', en: 'Settings', key: 'settings' },
  ]},
];

function TopNav({ active }) {
  return (
    <header className="wos-nav">
      <div className="brand">
        <span className="wm">HIIRAGI <em>TECH</em></span>
        <span className="sub">Workshop OS · 2026.05</span>
      </div>
      <nav className="nav-links">
        <a className={active === 'dashboard' ? 'active' : ''}>ダッシュボード</a>
        {NAV_ITEMS.map(n => (
          <a key={n.key} className={active === n.key ? 'active' : ''}>{n.jp}</a>
        ))}
      </nav>
      <div className="nav-right">
        <span className="user">SUZUKI · 桜サスペンション</span>
        <button className="signout">Sign out</button>
      </div>
    </header>
  );
}

function Sidebar({ active }) {
  return (
    <aside className="wos-side">
      <div className="brand">
        <span className="wm">HIIRAGI <em>TECH</em></span>
        <span className="sub">Workshop OS</span>
      </div>
      <nav className="nav">
        {SIDEBAR_NAV.map((g, gi) => (
          <React.Fragment key={gi}>
            <div className="grp">{g.group}</div>
            {g.items.map(it => (
              <a key={it.key} className={active === it.key ? 'active' : ''}>
                <span>{it.jp}</span>
                <span className="en">{it.en}</span>
              </a>
            ))}
          </React.Fragment>
        ))}
      </nav>
      <div className="foot">
        <span className="user">suzuki@sakura-susp.jp</span>
        <button className="signout">Sign out — ログアウト</button>
      </div>
    </aside>
  );
}

function PageHead({ num, label, titleHTML, glossHTML, actions, lhsWidth }) {
  return (
    <div className="wos-pagehead" style={lhsWidth ? { gridTemplateColumns: `${lhsWidth}px 1fr auto` } : null}>
      <div className="lhs">
        <div className="num-tag">
          <span className="n">{num}</span>
          <span className="dash">—</span>
          <span className="lbl">{label}</span>
        </div>
      </div>
      <div className="rhs">
        <h1 dangerouslySetInnerHTML={{ __html: titleHTML }} />
        {glossHTML && <div className="jp-gloss" dangerouslySetInnerHTML={{ __html: glossHTML }} />}
      </div>
      <div className="actions">{actions}</div>
    </div>
  );
}

// ====== Sample data ======================================================

const TODAY = '2026 / 05 / 26  (火)';

// Status enums mirroring lib/types.ts
const WORK = { U: '受付', S: '作業中', K: '完了' };
const EST  = { M: '未作成', H: '発行済', R: '了承済' };
const INV  = { M: '未請求', S: '請求済', N: '入金済' };

const ORDERS = [
  { id: 'ORD-2026-0152', date: '2026/05/24', customer: '山田 太郎',   kana: 'ヤマダ タロウ',    vehicle: 'HONDA CBR1000RR-R',     plate: '湘南 し 11-04', work: WORK.S, est: EST.R, inv: INV.S, due: '2026/06/24', amount: 286400, notes: 'SHOWA フロントフォークOH。フリクション軽減希望、初期作動性重視。', overdue: false },
  { id: 'ORD-2026-0151', date: '2026/05/24', customer: '佐藤 健一',   kana: 'サトウ ケンイチ',   vehicle: 'YAMAHA YZF-R6',         plate: '横浜 う 21-88', work: WORK.S, est: EST.R, inv: INV.M, due: null,         amount: 142800, notes: 'KYB リアショック。ストローク短縮の相談あり。', overdue: false },
  { id: 'ORD-2026-0150', date: '2026/05/23', customer: '田中 美咲',   kana: 'タナカ ミサキ',    vehicle: 'KAWASAKI Ninja ZX-10R', plate: '相模 や 88-12', work: WORK.K, est: EST.R, inv: INV.S, due: '2026/05/15', amount: 318000, notes: 'ÖHLINS TTX 36 再OH。前回交換から 18,000km。', overdue: true  },
  { id: 'ORD-2026-0149', date: '2026/05/23', customer: '鈴木 大輔',   kana: 'スズキ ダイスケ',   vehicle: 'DUCATI Panigale V4S',   plate: '横浜 す 03-22', work: WORK.U, est: EST.H, inv: INV.M, due: null,         amount: 488000, notes: 'ÖHLINS NIX30 + TTX。サーキット仕様。シム再設定込み。', overdue: false },
  { id: 'ORD-2026-0148', date: '2026/05/22', customer: '高橋 一郎',   kana: 'タカハシ イチロウ',  vehicle: 'SUZUKI GSX-R1000R',    plate: '川崎 さ 14-72', work: WORK.S, est: EST.R, inv: INV.M, due: null,         amount: 196500, notes: 'BPF再OH、ダンパー交換。', overdue: false },
  { id: 'ORD-2026-0147', date: '2026/05/21', customer: '中村 翔太',   kana: 'ナカムラ ショウタ',  vehicle: 'BMW S1000RR (2024)',    plate: '相模 ふ 33-09', work: WORK.K, est: EST.R, inv: INV.N, due: '2026/05/05', amount: 240000, notes: 'DDC不要、ノーマル化希望。スプリング選定込み。', overdue: false },
  { id: 'ORD-2026-0146', date: '2026/05/20', customer: '渡辺 慎一',   kana: 'ワタナベ シンイチ',  vehicle: 'TRIUMPH Speed Triple',  plate: '横浜 と 77-15', work: WORK.U, est: EST.M, inv: INV.M, due: null,         amount: null,   notes: '見積依頼受付中。マルゾッキ前期。', overdue: false },
  { id: 'ORD-2026-0145', date: '2026/05/19', customer: '木村 拓也',   kana: 'キムラ タクヤ',    vehicle: 'MV AGUSTA F4 1000R',    plate: '湘南 か 02-58', work: WORK.S, est: EST.R, inv: INV.S, due: '2026/06/02', amount: 372000, notes: 'マルゾッキ純正OH。シール劣化、油量再調整。', overdue: false },
];

const KPIS = [
  { n: '11',    label: 'In progress',  jp: '作業中の受注',          delta: '+3 since Mon', tone: 'work' },
  { n: '4',     label: 'Awaiting est', jp: '見積発行待ち',          delta: 'oldest 3 days', tone: 'est'  },
  { n: '7',     label: 'Unpaid',       jp: '未回収',                delta: '¥1,284,800',   tone: 'pay'  },
  { n: '2',     label: 'Overdue',      jp: '期限超過',              delta: '要連絡',        tone: 'over' },
  { n: '¥3.42M', label: 'Sales / MTD',  jp: '今月売上',              delta: '+18% vs Apr',  tone: 'sale' },
  { n: '3',     label: 'Low stock',    jp: '在庫アラート',          delta: 'SHOWA 油 41Φ', tone: 'stk'  },
];

const TASKS = [
  { kind: 'overdue', jp: '期限超過 · ORD-2026-0150 田中様',     en: 'Overdue 11 days · ¥318,000', due: '2026/05/15' },
  { kind: 'estimate', jp: '見積発行 · ORD-2026-0146 渡辺様',     en: 'Estimate pending',           due: '入庫から 5 日' },
  { kind: 'delivery', jp: '本日納車予定 · ORD-2026-0147 中村様', en: 'Delivery today',             due: '15:00' },
  { kind: 'parts',    jp: '部品到着 · KYB シール 36Φ',           en: 'Parts received',             due: '本日 11:30' },
  { kind: 'estimate', jp: '見積承認待ち · ORD-2026-0149 鈴木様', en: 'Estimate sent · 3 days',     due: '催促検討' },
];

const ACTIVITY = [
  { time: '14:22', who: '鈴木', jp: '請求書発行 · ORD-2026-0152 山田様 (¥286,400)' },
  { time: '13:48', who: '鈴木', jp: '作業完了 · ORD-2026-0147 中村様 BMW S1000RR' },
  { time: '11:20', who: '佐藤', jp: '入金確認 · ORD-2026-0147 (¥240,000)' },
  { time: '10:55', who: '鈴木', jp: '新規入庫 · ORD-2026-0152 HONDA CBR1000RR-R' },
  { time: '09:30', who: '佐藤', jp: '見積発行 · ORD-2026-0149 鈴木様 (¥488,000)' },
  { time: '昨日',  who: '鈴木', jp: '部品発注 · ÖHLINS シールキット ×3' },
];

Object.assign(window, {
  TopNav, Sidebar, PageHead,
  NAV_ITEMS, SIDEBAR_NAV,
  TODAY, WORK, EST, INV,
  ORDERS, KPIS, TASKS, ACTIVITY,
});
