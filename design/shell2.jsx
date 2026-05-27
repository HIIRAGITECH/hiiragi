// shell2.jsx — v2 共有チロム (日本語のみ・視認性重視)

const NAV2 = [
  { jp: 'ダッシュボード', key: 'dashboard' },
  { jp: '受注一覧',       key: 'orders'    },
  { jp: '顧客管理',       key: 'customers' },
  { jp: '入金管理',       key: 'payments'  },
  { jp: '在庫',           key: 'inventory' },
  { jp: '売上集計',       key: 'sales'     },
  { jp: '設定',           key: 'settings'  },
];

const SIDE_NAV2 = [
  { group: '業務', items: [
    { jp: 'ダッシュボード', key: 'dashboard', ct: null },
    { jp: '受注一覧',       key: 'orders',    ct: 11   },
    { jp: '顧客管理',       key: 'customers', ct: null },
  ]},
  { group: '会計', items: [
    { jp: '入金管理',       key: 'payments',  ct: 7    },
    { jp: '売上集計',       key: 'sales',     ct: null },
  ]},
  { group: '工房', items: [
    { jp: '作業メニュー',   key: 'work-menus', ct: null },
    { jp: '作業セット',     key: 'work-sets',  ct: null },
    { jp: '部品在庫',       key: 'parts',      ct: 3    },
  ]},
  { group: 'システム', items: [
    { jp: '設定',           key: 'settings',  ct: null },
  ]},
];

function TopNav2({ active }) {
  return (
    <header className="topnav">
      <div className="brand">
        <span className="wm">HIIRAGI <em>TECH</em></span>
        <span className="sub">工房管理システム</span>
      </div>
      <nav className="links">
        {NAV2.map(n => (
          <a key={n.key} className={active === n.key ? 'active' : ''}>{n.jp}</a>
        ))}
      </nav>
      <div className="right">
        <div style={{ textAlign: 'right' }}>
          <div className="user">鈴木 大輔</div>
          <div className="user-sub">桜サスペンション 横浜店</div>
        </div>
        <button className="btn-ghost btn-sm">ログアウト</button>
      </div>
    </header>
  );
}

function Sidebar2({ active }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="wm">HIIRAGI <em>TECH</em></div>
        <div className="sub">工房管理システム</div>
      </div>
      <nav className="nav">
        {SIDE_NAV2.map((g, gi) => (
          <React.Fragment key={gi}>
            <div className="grp">{g.group}</div>
            {g.items.map(it => (
              <a key={it.key} className={active === it.key ? 'active' : ''}>
                <span>{it.jp}</span>
                {it.ct != null && <span className="ct">{it.ct}</span>}
              </a>
            ))}
          </React.Fragment>
        ))}
      </nav>
      <div className="foot">
        <div className="user">鈴木 大輔</div>
        <div className="user-sub">桜サスペンション 横浜店</div>
        <button className="signout">ログアウト</button>
      </div>
    </aside>
  );
}

function PageHead2({ crumbs, title, gloss, actions }) {
  return (
    <div className="pagehead">
      <div>
        {crumbs && <div className="crumbs">{crumbs}</div>}
        <h1>{title}</h1>
        {gloss && <div className="gloss">{gloss}</div>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

// 円表記ヘルパー(省略しない)
function yen2(n) {
  if (n == null) return '—';
  return '¥' + n.toLocaleString('en-US');
}

// 日数差分
function daysAgo2(d) {
  const parts = d.split('/');
  const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  const today = new Date(2026, 4, 27);
  return Math.max(0, Math.round((today - date) / 86400000));
}

// ステータス → CSSクラス
function statusClass(kind, value, overdue) {
  if (overdue) return 'over';
  const map = {
    work: { '受付': 'w-u', '作業中': 'w-s', '完了': 'w-k' },
    est:  { '未作成': 'e-m', '発行済': 'e-h', '了承済': 'e-r' },
    inv:  { '未請求': 'i-m', '請求済': 'i-s', '入金済': 'i-n' },
  };
  return (map[kind] && map[kind][value]) || '';
}

function StatusDot({ kind, value, overdue, size }) {
  return (
    <span className={`status ${statusClass(kind, value, overdue)}`} style={size ? { fontSize: size } : null}>
      <span className="dot"></span>
      <span>{overdue ? `${value}・期限超過` : value}</span>
    </span>
  );
}

Object.assign(window, {
  TopNav2, Sidebar2, PageHead2,
  yen2, daysAgo2, statusClass, StatusDot,
  NAV2, SIDE_NAV2,
});
