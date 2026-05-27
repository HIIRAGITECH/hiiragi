// dashboards.jsx — three dashboard directions for Workshop OS

// Helper: format yen with thousands separator
function yen(n) { if (n == null) return '—'; return '¥' + n.toLocaleString('en-US'); }

function StatusChip({ kind, value }) {
  // Renders status as dot+label
  const map = {
    work: { '受付': 'work-uketsuke', '作業中': 'work-sagyochu', '完了': 'work-kanryo' },
    est:  { '未作成': 'est-mi', '発行済': 'est-hakko', '了承済': 'est-ryosho' },
    inv:  { '未請求': 'inv-mi', '請求済': 'inv-seikyu', '入金済': 'inv-nyukin' },
  };
  return (
    <span className={`wos-status ${map[kind][value] || ''}`}>
      <span className="dot"></span><span className="lbl">{value}</span>
    </span>
  );
}

// ============================================================
// A · EDITORIAL LEDGER
// Top nav · big bilingual header · hairline KPI lattice (3 × 2)
// · "Today on the bench" current work strip · tasks ledger
// ============================================================
function DashboardA() {
  return (
    <div className="wos-art">
      <TopNav active="dashboard" />

      <PageHead
        num="01"
        label="Dashboard · 2026 / 05 / 26"
        titleHTML="Good morning. Three bikes <em>on the bench.</em>"
        glossHTML="本日 5月26日 (火)。 作業中 11件、未回収 ¥1,284,800、期限超過 2件。"
        actions={<>
          <button className="wos-btn-ghost">受注一覧 →</button>
          <button className="wos-btn-ink">+ 新規受注</button>
        </>}
      />

      <div className="wos-body" style={{ padding: '0 48px 36px', display: 'grid', gridTemplateColumns: '1fr 360px', gap: 48 }}>
        {/* LEFT COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 40, minHeight: 0 }}>
          {/* KPI lattice */}
          <div>
            <div className="wos-section-label">
              <span className="n">i.</span>
              <span className="accent-rule"></span>
              <span className="lbl">By the numbers / 数字で見る今日</span>
            </div>
            <div className="wos-lattice" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              {window.KPIS.map((k, i) => (
                <div key={i} style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className="mono mono-sm" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{k.label}</span>
                    <span style={{ fontFamily: 'var(--font-jp)', fontSize: 10, textTransform: 'none', letterSpacing: '0.1em' }}>{k.jp}</span>
                  </div>
                  <div className="num" style={{ fontSize: 44, color: 'var(--color-ink)', marginTop: 4 }}>
                    {k.tone === 'over' && k.n !== '0' ? <span style={{ color: '#b1503e', fontStyle: 'italic' }}>{k.n}</span> : k.n}
                  </div>
                  <div style={{ fontFamily: 'var(--font-jp)', fontSize: 11, color: 'var(--color-ink-soft)', letterSpacing: '0.06em' }}>{k.delta}</div>
                </div>
              ))}
            </div>
          </div>

          {/* On the bench */}
          <div>
            <div className="wos-section-label">
              <span className="n">ii.</span>
              <span className="accent-rule"></span>
              <span className="lbl">On the bench / 作業台の上</span>
            </div>
            <div className="wos-lattice" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              {window.ORDERS.filter(o => o.work === '作業中').slice(0,3).map(o => (
                <div key={o.id} style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span className="ital" style={{ fontSize: 14 }}>{o.id.replace('ORD-2026-', '·')}</span>
                    <StatusChip kind="work" value={o.work} />
                  </div>
                  <div className="serif" style={{ fontSize: 19, color: 'var(--color-ink)', lineHeight: 1.25 }}>{o.vehicle}</div>
                  <div style={{ fontFamily: 'var(--font-jp)', fontSize: 12, color: 'var(--color-ink-soft)', letterSpacing: '0.08em' }}>{o.customer} <span style={{ color: 'var(--color-ink-light)' }}>· {o.plate}</span></div>
                  <div style={{ flex: 1 }}></div>
                  <div className="rule"></div>
                  <div className="mono mono-sm" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>入庫 {o.date.slice(5)}</span>
                    <span>{yen(o.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN — pending tasks */}
        <div style={{ minHeight: 0, overflow: 'hidden' }}>
          <div className="wos-section-label">
            <span className="n">iii.</span>
            <span className="accent-rule"></span>
            <span className="lbl">Today's attention / 要対応</span>
          </div>
          <div style={{ borderTop: '1px solid var(--color-line)' }}>
            {window.TASKS.map((t, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '14px 0', borderBottom: '1px solid var(--color-line)', gap: 12 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontFamily: 'var(--font-jp)', fontSize: 13, color: t.kind === 'overdue' ? '#b1503e' : 'var(--color-ink)', letterSpacing: '0.06em', lineHeight: 1.4 }}>{t.jp}</div>
                  <div className="mono mono-sm" style={{ marginTop: 4 }}>{t.en}</div>
                </div>
                <div className="mono mono-sm" style={{ color: t.kind === 'overdue' ? '#b1503e' : 'var(--color-ink-light)', whiteSpace: 'nowrap' }}>{t.due}</div>
              </div>
            ))}
          </div>
          <button className="wos-btn-ghost" style={{ marginTop: 20, width: '100%' }}>View all tasks →</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// B · ATELIER DARK HERO
// Top nav · dark hero with today's headline + hero KPI · cream KPI strip ·
// 2-col split (unpaid ledger / activity feed)
// ============================================================
function DashboardB() {
  const inProg = window.ORDERS.filter(o => o.work === '作業中').length;
  const unpaid = window.ORDERS.filter(o => o.inv === '請求済').length;
  const overdue = window.ORDERS.filter(o => o.overdue).length;
  const unpaidYen = window.ORDERS.filter(o => o.inv === '請求済').reduce((s,o)=>s+(o.amount||0),0);

  return (
    <div className="wos-art">
      <TopNav active="dashboard" />

      {/* Dark hero */}
      <div className="hero-dark" style={{ padding: '32px 48px 36px' }}>
        <div className="lbl-row">
          <span className="accent-rule"></span>
          <span className="lbl">FIG. 01 · {window.TODAY}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', alignItems: 'end', gap: 60 }}>
          <h1>
            Eleven bikes <em>at work,</em><br/>
            two of which are <em>overdue.</em>
          </h1>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, paddingBottom: 6 }}>
            <HeroStat n={inProg}  jp="作業中"  en="In progress" />
            <HeroStat n={unpaid}  jp="未回収"  en="Unpaid"      />
            <HeroStat n={overdue} jp="期限超過" en="Overdue" warn />
          </div>
        </div>
      </div>

      {/* KPI strip on cream */}
      <div style={{ padding: '28px 48px 0', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, borderBottom: '1px solid var(--color-line)' }}>
        <KpiCell n="¥3.42M" en="Sales · MTD" jp="今月売上"     delta="+18% vs Apr" />
        <KpiCell n="¥1.28M" en="A/R balance"  jp="未回収合計"   delta="2 件 期限超過" warn />
        <KpiCell n="48 件"  en="MTD orders"   jp="今月入庫"     delta="平均 1.9 件/日" />
        <KpiCell n="3 件"   en="Low stock"    jp="在庫アラート" delta="要発注" last />
      </div>

      {/* 2-col body */}
      <div className="wos-body" style={{ padding: '28px 48px 32px', display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 56 }}>
        {/* Unpaid ledger */}
        <div>
          <div className="wos-section-label">
            <span className="n">i.</span>
            <span className="accent-rule"></span>
            <span className="lbl">Unpaid invoices / 未回収一覧</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-jp)' }}>
            <thead>
              <tr style={{ borderTop: '1px solid var(--color-line)', borderBottom: '1px solid var(--color-line)' }}>
                <Th>No.</Th><Th>顧客</Th><Th>車両</Th><Th right>金額</Th><Th right>振込期限</Th>
              </tr>
            </thead>
            <tbody>
              {window.ORDERS.filter(o=>o.inv==='請求済').map(o => (
                <tr key={o.id} style={{ borderBottom: '1px solid var(--color-line)' }}>
                  <td style={cellStyle()}><span className="ital" style={{ fontSize: 13 }}>{o.id.replace('ORD-2026-', '')}</span></td>
                  <td style={cellStyle()}>{o.customer}</td>
                  <td style={{...cellStyle(), color: 'var(--color-ink-soft)' }}>{o.vehicle}</td>
                  <td style={{...cellStyle(true), fontFamily: 'var(--font-display)' }}>{yen(o.amount)}</td>
                  <td style={{...cellStyle(true), color: o.overdue ? '#b1503e' : 'var(--color-ink-soft)' }}>
                    {o.due ? o.due.slice(5) : '—'} {o.overdue && <span style={{ marginLeft: 6 }}>· 超過</span>}
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={3} style={{ ...cellStyle(), fontFamily: 'var(--font-inter)', fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--color-ink-light)' }}>Total · 合計</td>
                <td style={{ ...cellStyle(true), fontFamily: 'var(--font-display)', fontStyle: 'italic', color: 'var(--color-accent)', fontSize: 18 }}>{yen(unpaidYen)}</td>
                <td style={cellStyle(true)}></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Activity feed */}
        <div style={{ minHeight: 0, overflow: 'hidden' }}>
          <div className="wos-section-label">
            <span className="n">ii.</span>
            <span className="accent-rule"></span>
            <span className="lbl">Activity / 本日の記録</span>
          </div>
          <div>
            {window.ACTIVITY.map((a, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '54px 36px 1fr', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--color-line)', alignItems: 'baseline' }}>
                <div className="mono mono-sm" style={{ color: 'var(--color-ink-soft)' }}>{a.time}</div>
                <div className="ital" style={{ fontSize: 12 }}>{a.who}</div>
                <div style={{ fontFamily: 'var(--font-jp)', fontSize: 12.5, color: 'var(--color-ink-soft)', letterSpacing: '0.06em', lineHeight: 1.5 }}>{a.jp}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroStat({ n, jp, en, warn }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="num" style={{ fontSize: 64, color: warn ? '#d8a075' : 'var(--color-on-ink-fg)', fontStyle: warn ? 'italic' : 'normal' }}>{n}</span>
      <span style={{ fontFamily: 'var(--font-jp)', fontSize: 11, letterSpacing: '0.16em', color: 'rgba(255,255,255,0.75)' }}>{jp}</span>
      <span className="mono mono-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>{en}</span>
    </div>
  );
}

function KpiCell({ n, en, jp, delta, warn, last }) {
  return (
    <div style={{ padding: '22px 24px 22px 0', borderRight: last ? 'none' : '1px solid var(--color-line)', paddingLeft: 0, marginRight: last ? 0 : 24 }}>
      <div className="mono mono-sm" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{en}</span>
        <span style={{ fontFamily: 'var(--font-jp)', textTransform: 'none', letterSpacing: '0.1em', fontSize: 10 }}>{jp}</span>
      </div>
      <div className="num" style={{ fontSize: 36, marginTop: 8, color: warn ? '#b1503e' : 'var(--color-ink)', fontStyle: warn ? 'italic' : 'normal' }}>{n}</div>
      <div style={{ fontFamily: 'var(--font-jp)', fontSize: 11, color: warn ? '#b1503e' : 'var(--color-ink-soft)', letterSpacing: '0.06em', marginTop: 4 }}>{delta}</div>
    </div>
  );
}

function Th({ children, right }) {
  return <th style={{ padding: '10px 6px', fontFamily: 'var(--font-inter)', fontSize: 9.5, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'var(--color-ink-light)', fontWeight: 400, textAlign: right ? 'right' : 'left' }}>{children}</th>;
}
function cellStyle(right) {
  return { padding: '12px 6px', fontSize: 12.5, color: 'var(--color-ink)', letterSpacing: '0.06em', textAlign: right ? 'right' : 'left', verticalAlign: 'middle' };
}

// ============================================================
// C · SIDEBAR OPS
// Dark sidebar · cream content · KPI row · 2-col working panels
// (denser, more software-like)
// ============================================================
function DashboardC() {
  return (
    <div className="wos-art" style={{ flexDirection: 'row' }}>
      <Sidebar active="dashboard" />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {/* Subheader bar inside content area */}
        <div style={{ padding: '24px 40px', borderBottom: '1px solid var(--color-line)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div className="mono mono-sm" style={{ marginBottom: 8 }}>{window.TODAY}  ·  Dashboard</div>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 32, letterSpacing: '-0.015em', color: 'var(--color-ink)' }}>
              本日の作業 — <em style={{ color: 'var(--color-accent)', fontStyle: 'italic' }}>three bikes on the bench.</em>
            </h2>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="wos-btn-ghost">アーカイブ</button>
            <button className="wos-btn-ink">+ 新規受注</button>
          </div>
        </div>

        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 0, borderBottom: '1px solid var(--color-line)' }}>
          {window.KPIS.map((k, i) => (
            <div key={i} style={{ padding: '20px 22px', borderRight: i < 5 ? '1px solid var(--color-line)' : 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="mono mono-sm">{k.label}</div>
              <div className="num" style={{ fontSize: 30, color: k.tone === 'over' ? '#b1503e' : 'var(--color-ink)', fontStyle: k.tone === 'over' ? 'italic' : 'normal' }}>{k.n}</div>
              <div style={{ fontFamily: 'var(--font-jp)', fontSize: 10.5, color: 'var(--color-ink-soft)', letterSpacing: '0.08em' }}>{k.jp} · {k.delta}</div>
            </div>
          ))}
        </div>

        {/* Two working panels */}
        <div className="wos-body" style={{ padding: '24px 40px 32px', display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 36 }}>
          {/* Orders to action */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            <div className="wos-section-label" style={{ margin: 0 }}>
              <span className="n">i.</span>
              <span className="accent-rule"></span>
              <span className="lbl">Orders requiring action / 要対応の受注</span>
              <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-inter)', fontSize: 10, letterSpacing: '0.25em', color: 'var(--color-ink-light)' }}>4 件</span>
            </div>
            <div style={{ borderTop: '1px solid var(--color-line)' }}>
              {[
                { ord: window.ORDERS[2], reason: '請求 期限超過 11日', tone: 'overdue' },
                { ord: window.ORDERS[6], reason: '見積 発行待ち', tone: 'pending' },
                { ord: window.ORDERS[3], reason: '見積 承認待ち · 3日経過', tone: 'pending' },
                { ord: window.ORDERS[5], reason: '本日 納車予定 15:00', tone: 'today' },
              ].map((row, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 160px 120px', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--color-line)', alignItems: 'center' }}>
                  <span className="ital" style={{ fontSize: 14 }}>{row.ord.id.replace('ORD-2026-', '')}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-jp)', fontSize: 12.5, color: 'var(--color-ink)', letterSpacing: '0.06em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.ord.customer} · {row.ord.vehicle}</div>
                    <div className="mono mono-sm" style={{ marginTop: 3 }}>{row.ord.plate}</div>
                  </div>
                  <span style={{ fontFamily: 'var(--font-jp)', fontSize: 12, color: row.tone === 'overdue' ? '#b1503e' : 'var(--color-ink-soft)', letterSpacing: '0.06em' }}>{row.reason}</span>
                  <button className="wos-btn-ghost" style={{ padding: '8px 12px', fontSize: 9.5 }}>開く →</button>
                </div>
              ))}
            </div>
          </div>

          {/* Payments to chase */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="wos-section-label" style={{ margin: 0 }}>
              <span className="n">ii.</span>
              <span className="accent-rule"></span>
              <span className="lbl">A/R · 未回収</span>
              <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-inter)', fontSize: 10, letterSpacing: '0.25em', color: 'var(--color-ink-light)' }}>¥1,284,800</span>
            </div>
            <div style={{ borderTop: '1px solid var(--color-line)' }}>
              {window.ORDERS.filter(o=>o.inv==='請求済').map(o => (
                <div key={o.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 14, padding: '11px 0', borderBottom: '1px solid var(--color-line)', alignItems: 'baseline' }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-jp)', fontSize: 12.5, color: 'var(--color-ink)', letterSpacing: '0.06em' }}>{o.customer}</div>
                    <div className="mono mono-sm" style={{ marginTop: 2 }}>{o.id.replace('ORD-2026-','#')} · 期限 {o.due ? o.due.slice(5) : '—'}</div>
                  </div>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--color-ink)', letterSpacing: '-0.01em' }}>{yen(o.amount)}</span>
                  {o.overdue && <span style={{ fontFamily: 'var(--font-inter)', fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#b1503e' }}>超過</span>}
                  {!o.overdue && <span style={{ fontFamily: 'var(--font-inter)', fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--color-ink-light)' }}>—</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { DashboardA, DashboardB, DashboardC, StatusChip, yen });
