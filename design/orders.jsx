// orders.jsx — three "受注一覧" (Orders list) directions for Workshop OS

// ============================================================
// A · SPECIMEN PLATE TABLE
// Top nav · big header · search + filter chip row · hairline ledger table
// All status as dot+label (no colored pills). Mono uppercase column heads.
// ============================================================
function OrdersA() {
  return (
    <div className="wos-art">
      <TopNav active="orders" />

      <PageHead
        num="02"
        label="Orders · 受注一覧 · 48 件"
        titleHTML="Eight active jobs, <em>laid flat.</em>"
        glossHTML="進行中の受注。古いものから順に並んでいます。"
        actions={<>
          <button className="wos-btn-ghost">アーカイブ</button>
          <button className="wos-btn-ink">+ 新規受注</button>
        </>}
      />

      {/* Filter / search bar */}
      <div style={{ padding: '0 48px 16px', display: 'flex', alignItems: 'center', gap: 32 }}>
        <div className="wos-search">
          <span className="mono mono-sm">SEARCH</span>
          <input placeholder="管理番号 · 顧客名 · 車種 · メモ…" />
          <span className="key">⌘ K</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span className="mono mono-sm" style={{ marginRight: 4 }}>FILTER</span>
          <span className="wos-tag active">All · 全て</span>
          <span className="wos-tag">受付</span>
          <span className="wos-tag">作業中</span>
          <span className="wos-tag">完了</span>
          <span style={{ width: 1, height: 16, background: 'var(--color-line)', margin: '0 6px' }}></span>
          <span className="wos-tag">未請求</span>
          <span className="wos-tag">期限超過</span>
        </div>
      </div>

      {/* The table */}
      <div className="wos-body" style={{ padding: '0 48px 32px', minHeight: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-jp)' }}>
          <thead>
            <tr style={{ borderTop: '1px solid var(--color-line)', borderBottom: '1px solid var(--color-line)' }}>
              <ThA width="14%">管理番号 · No.</ThA>
              <ThA width="14%">受付 · Recv.</ThA>
              <ThA width="18%">顧客 · Customer</ThA>
              <ThA width="22%">車両 · Vehicle</ThA>
              <ThA width="22%">状態 · Status</ThA>
              <ThA width="10%" right>金額</ThA>
            </tr>
          </thead>
          <tbody>
            {window.ORDERS.map(o => (
              <tr key={o.id} style={{ borderBottom: '1px solid var(--color-line)' }}>
                <TdA>
                  <span className="ital" style={{ fontSize: 15 }}>{o.id.replace('ORD-2026-', '')}</span>
                  <span style={{ fontFamily: 'var(--font-inter)', fontSize: 9, letterSpacing: '0.22em', color: 'var(--color-ink-light)', marginLeft: 6 }}>2026</span>
                </TdA>
                <TdA>
                  <div style={{ color: 'var(--color-ink)' }}>{o.date}</div>
                  <div className="mono mono-sm" style={{ marginTop: 2 }}>{daysAgo(o.date)} 日経過</div>
                </TdA>
                <TdA>
                  <div style={{ color: 'var(--color-ink)' }}>{o.customer}</div>
                  <div className="mono mono-sm" style={{ marginTop: 2 }}>{o.kana}</div>
                </TdA>
                <TdA>
                  <div style={{ color: 'var(--color-ink)' }}>{o.vehicle}</div>
                  <div className="mono mono-sm" style={{ marginTop: 2 }}>{o.plate}</div>
                </TdA>
                <TdA>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <StatusLine label="作業" kind="work" value={o.work} />
                    <StatusLine label="見積" kind="est"  value={o.est}  />
                    <StatusLine label="請求" kind="inv"  value={o.inv}  overdue={o.overdue && o.inv === '請求済'} />
                  </div>
                </TdA>
                <TdA right>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--color-ink)', letterSpacing: '-0.01em' }}>{o.amount ? '¥' + o.amount.toLocaleString('en-US') : '—'}</span>
                  <div style={{ marginTop: 6 }}>
                    <span style={{ fontFamily: 'var(--font-inter)', fontSize: 9.5, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--color-accent)' }}>View details →</span>
                  </div>
                </TdA>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ThA({ children, width, right }) {
  return <th style={{ padding: '14px 8px', fontFamily: 'var(--font-inter)', fontSize: 9.5, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'var(--color-ink-light)', fontWeight: 400, textAlign: right ? 'right' : 'left', width }}>{children}</th>;
}
function TdA({ children, right }) {
  return <td style={{ padding: '16px 8px', fontSize: 13, color: 'var(--color-ink)', letterSpacing: '0.06em', textAlign: right ? 'right' : 'left', verticalAlign: 'top' }}>{children}</td>;
}

function StatusLine({ label, kind, value, overdue }) {
  const map = {
    work: { '受付': ['work-uketsuke','—'], '作業中': ['work-sagyochu','—'], '完了': ['work-kanryo','—'] },
    est:  { '未作成': ['est-mi','—'],      '発行済': ['est-hakko','—'],    '了承済': ['est-ryosho','—'] },
    inv:  { '未請求': ['inv-mi','—'],      '請求済': ['inv-seikyu','—'],   '入金済': ['inv-nyukin','—'] },
  };
  const cls = map[kind][value][0];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span className="mono mono-sm" style={{ width: 28 }}>{label}</span>
      <span className={`wos-status ${overdue ? 'overdue' : cls}`}>
        <span className="dot"></span>
        <span className="lbl" style={{ fontSize: 11.5 }}>{overdue ? `${value} · 超過` : value}</span>
      </span>
    </span>
  );
}

function daysAgo(d) {
  const parts = d.split('/');
  const date = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
  const today = new Date(2026, 4, 26);
  return Math.max(0, Math.round((today - date) / 86400000));
}

// ============================================================
// B · ORDER CARDS — editorial row cards, generous breathing room
// ============================================================
function OrdersB() {
  return (
    <div className="wos-art">
      <TopNav active="orders" />

      <PageHead
        num="02"
        label="Orders · 受注帳"
        titleHTML="The shop floor, <em>as a ledger.</em>"
        glossHTML="一件ずつ。 入庫から請求まで、各受注の現状を見渡せます。"
        actions={<>
          <button className="wos-btn-ghost">アーカイブ</button>
          <button className="wos-btn-ink">+ 新規受注</button>
        </>}
      />

      <div style={{ padding: '0 48px 16px', display: 'flex', alignItems: 'center', gap: 24 }}>
        <div className="wos-search">
          <span className="mono mono-sm">SEARCH</span>
          <input placeholder="管理番号 · 顧客名 · 車種 · メモ…" />
          <span className="key">⌘ K</span>
        </div>
        <span className="mono mono-sm">SORT</span>
        <span className="wos-tag active">最新の入庫順</span>
        <span className="wos-tag">期限が近い順</span>
        <span className="wos-tag">金額順</span>
      </div>

      <div className="wos-body" style={{ padding: '0 48px 32px', overflow: 'hidden' }}>
        <div style={{ borderTop: '1px solid var(--color-line)' }}>
          {window.ORDERS.slice(0, 6).map(o => (
            <OrderRowCard key={o.id} o={o} />
          ))}
        </div>
      </div>
    </div>
  );
}

function OrderRowCard({ o }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '140px 1fr 280px 220px 100px',
      gap: 32,
      padding: '20px 0',
      borderBottom: '1px solid var(--color-line)',
      alignItems: 'center',
    }}>
      {/* Numeral block */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="ital" style={{ fontSize: 28, lineHeight: 1, color: o.overdue ? '#b1503e' : 'var(--color-accent)' }}>{o.id.replace('ORD-2026-', '')}</span>
        <span className="mono mono-sm">{o.date}</span>
        <span className="mono mono-sm" style={{ color: 'var(--color-ink-light)' }}>{daysAgo(o.date)} 日経過</span>
      </div>

      {/* Customer + vehicle */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--color-ink)', letterSpacing: '-0.005em', lineHeight: 1.2 }}>{o.vehicle}</div>
        <div style={{ fontFamily: 'var(--font-jp)', fontSize: 13, color: 'var(--color-ink-soft)', letterSpacing: '0.08em', marginTop: 4 }}>
          {o.customer}  <span style={{ color: 'var(--color-ink-light)' }}>· {o.kana} · {o.plate}</span>
        </div>
        <div style={{ fontFamily: 'var(--font-jp)', fontSize: 12, color: 'var(--color-ink-light)', letterSpacing: '0.06em', marginTop: 8, maxWidth: 560, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          — {o.notes}
        </div>
      </div>

      {/* Status rail */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <StatusRailRow label="作業" en="WORK"     kind="work" value={o.work} />
        <StatusRailRow label="見積" en="ESTIMATE" kind="est"  value={o.est} />
        <StatusRailRow label="請求" en="INVOICE"  kind="inv"  value={o.inv} overdue={o.overdue && o.inv === '請求済'} />
      </div>

      {/* Amount / due */}
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--color-ink)', letterSpacing: '-0.01em', fontWeight: 300 }}>
          {o.amount ? '¥' + o.amount.toLocaleString('en-US') : <span style={{ color: 'var(--color-ink-light)' }}>— 見積前</span>}
        </div>
        {o.due && (
          <div className="mono mono-sm" style={{ marginTop: 4, color: o.overdue ? '#b1503e' : 'var(--color-ink-light)' }}>
            DUE · {o.due.slice(5)}{o.overdue && ' · 超過'}
          </div>
        )}
      </div>

      {/* Arrow */}
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--color-accent)', fontStyle: 'italic' }}>→</span>
      </div>
    </div>
  );
}

function StatusRailRow({ label, en, kind, value, overdue }) {
  const cls = {
    work: { '受付': 'work-uketsuke', '作業中': 'work-sagyochu', '完了': 'work-kanryo' },
    est:  { '未作成': 'est-mi', '発行済': 'est-hakko', '了承済': 'est-ryosho' },
    inv:  { '未請求': 'inv-mi', '請求済': 'inv-seikyu', '入金済': 'inv-nyukin' },
  }[kind][value];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr', gap: 12, alignItems: 'center' }}>
      <span className="mono mono-sm" style={{ borderBottom: '1px solid var(--color-line)', paddingBottom: 3 }}>{en}</span>
      <span className={`wos-status ${overdue ? 'overdue' : cls}`}>
        <span className="dot"></span>
        <span className="lbl" style={{ fontSize: 12 }}>{value}{overdue ? ' · 期限超過' : ''}</span>
      </span>
    </div>
  );
}

// ============================================================
// C · WORKBENCH BOARD — kanban by work_status
// 3 columns: 受付 / 作業中 / 完了 — each card is a paper tile
// ============================================================
function OrdersC() {
  const byStatus = {
    '受付':   window.ORDERS.filter(o => o.work === '受付'),
    '作業中': window.ORDERS.filter(o => o.work === '作業中'),
    '完了':   window.ORDERS.filter(o => o.work === '完了'),
  };
  const cols = [
    { jp: '受付',   en: 'Intake',     num: 'i.',   desc: '入庫したばかり' },
    { jp: '作業中', en: 'On the bench', num: 'ii.',  desc: 'メカニックの手元にある' },
    { jp: '完了',   en: 'Finished',   num: 'iii.', desc: '納車・請求待ち' },
  ];
  return (
    <div className="wos-art">
      <TopNav active="orders" />

      <PageHead
        num="02"
        label="Orders · 作業台ボード"
        titleHTML="The bench, <em>at a glance.</em>"
        glossHTML="作業ステータス別。 左から右へ、入庫から完了までの流れを追えます。"
        lhsWidth={200}
        actions={<>
          <span className="wos-tag">作業台</span>
          <span className="wos-tag active">テーブル</span>
          <button className="wos-btn-ink" style={{ marginLeft: 8 }}>+ 新規受注</button>
        </>}
      />

      <div className="wos-body" style={{ padding: '0 48px 32px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--color-line)', borderTop: '1px solid var(--color-line)', borderBottom: '1px solid var(--color-line)', overflow: 'hidden' }}>
        {cols.map((c, ci) => {
          const items = byStatus[c.jp];
          return (
            <div key={c.jp} style={{ background: ci === 1 ? 'var(--color-paper)' : 'var(--color-cream)', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span className="ital" style={{ fontSize: 18 }}>{c.num}</span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--color-ink)', letterSpacing: '-0.005em' }}>{c.jp}</span>
                  <span className="mono mono-sm" style={{ marginLeft: 4 }}>{c.en}</span>
                </div>
                <span className="ital" style={{ fontSize: 22 }}>{items.length}</span>
              </div>
              <div className="mono mono-sm" style={{ marginTop: -8 }}>— {c.desc}</div>
              <span className="rule" style={{ background: ci === 1 ? 'var(--color-line)' : 'var(--color-line)', marginTop: 2 }}></span>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
                {items.map(o => <BoardCard key={o.id} o={o} elev={ci === 1} />)}
                {items.length === 0 && (
                  <div style={{ fontFamily: 'var(--font-jp)', fontSize: 12, color: 'var(--color-ink-light)', padding: '24px 0', textAlign: 'center', letterSpacing: '0.1em' }}>該当なし</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BoardCard({ o, elev }) {
  return (
    <div style={{
      background: elev ? 'var(--color-cream)' : 'var(--color-paper)',
      border: '1px solid var(--color-line)',
      padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="ital" style={{ fontSize: 18, color: o.overdue ? '#b1503e' : 'var(--color-accent)' }}>{o.id.replace('ORD-2026-', '')}</span>
        <span className="mono mono-sm">{o.date.slice(5)}</span>
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--color-ink)', letterSpacing: '-0.005em', lineHeight: 1.25 }}>{o.vehicle}</div>
      <div style={{ fontFamily: 'var(--font-jp)', fontSize: 12, color: 'var(--color-ink-soft)', letterSpacing: '0.06em' }}>{o.customer}  <span style={{ color: 'var(--color-ink-light)' }}>· {o.plate}</span></div>
      <div style={{ fontFamily: 'var(--font-jp)', fontSize: 11.5, color: 'var(--color-ink-light)', letterSpacing: '0.06em', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
        — {o.notes}
      </div>
      <span className="rule"></span>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <BoardMini kind="est" value={o.est} />
          <BoardMini kind="inv" value={o.inv} overdue={o.overdue && o.inv === '請求済'} />
        </div>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--color-ink)', letterSpacing: '-0.01em' }}>
          {o.amount ? '¥' + (o.amount/1000).toFixed(0) + 'k' : '—'}
        </span>
      </div>
    </div>
  );
}

function BoardMini({ kind, value, overdue }) {
  const labels = { est: '見', inv: '請' };
  const cls = {
    est:  { '未作成': 'est-mi', '発行済': 'est-hakko', '了承済': 'est-ryosho' },
    inv:  { '未請求': 'inv-mi', '請求済': 'inv-seikyu', '入金済': 'inv-nyukin' },
  }[kind][value];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span className="mono mono-sm" style={{ color: 'var(--color-ink-light)' }}>{labels[kind]}</span>
      <span className={`wos-status ${overdue ? 'overdue' : cls}`} style={{ gap: 4 }}>
        <span className="dot"></span>
        <span className="lbl" style={{ fontSize: 11 }}>{value}</span>
      </span>
    </span>
  );
}

Object.assign(window, { OrdersA, OrdersB, OrdersC });
