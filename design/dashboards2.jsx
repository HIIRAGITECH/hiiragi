// dashboards2.jsx — v2 ダッシュボード3案 (日本語のみ・視認性重視)

// ============================================================
// A · 帳簿型 (台帳)
// トップナビ + 大きな数字の KPI格子 + 進行中の作業 + 要対応リスト
// ============================================================
function DashboardA2() {
  return (
    <div className="wos-art">
      <TopNav2 active="dashboard" />

      <PageHead2
        crumbs="2026年5月27日（水曜日）"
        title="本日の作業 — 作業中 11件"
        gloss="未回収 ¥1,284,800 ／ 期限超過 2件 ／ 本日納車予定 1件。"
        actions={<>
          <button className="btn-ghost">受注一覧</button>
          <button className="btn">新規受注を作成</button>
        </>}
      />

      <div className="body-area" style={{ padding: '0 40px 32px', display: 'grid', gridTemplateColumns: '1fr 380px', gap: 40 }}>
        {/* 左カラム */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32, minWidth: 0 }}>
          {/* KPI */}
          <div>
            <div className="sec-label" style={{ marginBottom: 16 }}>本日の数字</div>
            <div className="lattice" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              {window.KPIS2.map((k, i) => (
                <div key={i} style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-ink-mid)', letterSpacing: '0.08em' }}>{k.jp}</div>
                  <div className="num-big" style={{ fontSize: 42, color: k.warn ? 'var(--color-warn)' : 'var(--color-ink)', marginTop: 4 }}>{k.n}</div>
                  <div style={{ fontSize: 12, color: k.warn ? 'var(--color-warn)' : 'var(--color-ink-light)', fontWeight: 500, letterSpacing: '0.04em' }}>{k.delta}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 作業台の上 */}
          <div>
            <div className="sec-label" style={{ marginBottom: 16 }}>作業台の上 <span className="count">3件</span></div>
            <div className="lattice" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              {window.ORDERS.filter(o => o.work === '作業中').slice(0, 3).map(o => (
                <div key={o.id} style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontFamily: 'var(--font-num)', fontWeight: 500, fontSize: 14, color: 'var(--color-accent)', letterSpacing: '0.04em' }}>No. {o.id.replace('ORD-2026-', '')}</span>
                    <StatusDot kind="work" value={o.work} />
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--color-ink)', lineHeight: 1.3, letterSpacing: '0.02em' }}>{o.vehicle}</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-ink-soft)' }}>{o.customer} 様 <span style={{ color: 'var(--color-ink-light)', fontWeight: 400 }}>／ {o.plate}</span></div>
                  <div style={{ flex: 1 }}></div>
                  <div className="hair"></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 12, color: 'var(--color-ink-light)' }}>入庫 {o.date}</span>
                    <span className="yen" style={{ fontSize: 16, color: 'var(--color-ink)' }}>{window.yen2(o.amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 右カラム — 要対応 */}
        <div style={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="sec-label" style={{ marginBottom: 16 }}>要対応 <span className="count">本日 {window.TASKS2.length}件</span></div>
          <div style={{ borderTop: '1px solid var(--color-line)' }}>
            {window.TASKS2.map((t, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '16px 0', borderBottom: '1px solid var(--color-line)', gap: 12 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', color: t.overdue ? 'var(--color-warn)' : 'var(--color-accent)', marginBottom: 4 }}>{t.tag}</div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-ink)', letterSpacing: '0.03em', lineHeight: 1.5 }}>{t.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-ink-mid)', marginTop: 4, letterSpacing: '0.04em' }}>{t.sub}</div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 500, color: t.overdue ? 'var(--color-warn)' : 'var(--color-ink-light)', whiteSpace: 'nowrap', letterSpacing: '0.04em', paddingTop: 18 }}>{t.due}</div>
              </div>
            ))}
          </div>
          <button className="btn-ghost" style={{ marginTop: 18 }}>すべての要対応を見る</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// B · 暗色ヒーロー
// 上部の暗色帯で「朝一に把握する数字」を大きく出す
// ============================================================
function DashboardB2() {
  // 上部のヘッドラインと KPIストリップの数字に揃える(サンプルデータの件数ではなく工房全体の状況)
  const inProg = 11;
  const unpaid = 7;
  const overdue = 2;
  const unpaidYen = 1284800;

  return (
    <div className="wos-art">
      <TopNav2 active="dashboard" />

      <div className="hero-dark">
        <div className="crumb">2026年5月27日（水曜日） ／ ダッシュボード</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 540px', alignItems: 'end', gap: 40 }}>
          <h1>本日 <em>11台</em> の作業、<br/>うち <span className="warn">2台</span> が期限を過ぎています。</h1>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, paddingBottom: 4 }}>
            <HeroStat2 n={inProg}   suffix="件" jp="作業中"     />
            <HeroStat2 n={unpaid}   suffix="件" jp="未回収"     />
            <HeroStat2 n={overdue}  suffix="件" jp="期限超過"   warn />
          </div>
        </div>
      </div>

      {/* KPIストリップ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: '1px solid var(--color-line)', background: 'var(--color-paper)' }}>
        <KpiCell2 n="¥3,420,000" jp="今月売上"     delta="前月比 +18%" />
        <KpiCell2 n="¥1,284,800" jp="未回収合計"   delta="期限超過 2件" warn />
        <KpiCell2 n="48 件"      jp="今月の入庫数" delta="平均 1.9件／日" />
        <KpiCell2 n="3 件"       jp="在庫アラート" delta="要発注" last />
      </div>

      {/* 2カラム本体 */}
      <div className="body-area" style={{ padding: '28px 40px 28px', display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 48 }}>
        {/* 未回収一覧 */}
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="sec-label" style={{ marginBottom: 14 }}>未回収の請求 <span className="count">{unpaid}件・合計 {window.yen2(unpaidYen)}</span></div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-jp)' }}>
            <thead>
              <tr style={{ borderTop: '1px solid var(--color-line)', borderBottom: '2px solid var(--color-line-strong)' }}>
                <Th2 w="14%">管理番号</Th2><Th2 w="22%">顧客</Th2><Th2>車両</Th2>
                <Th2 right w="18%">金額</Th2><Th2 right w="18%">振込期限</Th2>
              </tr>
            </thead>
            <tbody>
              {window.ORDERS.filter(o => o.inv === '請求済').map(o => (
                <tr key={o.id} style={{ borderBottom: '1px solid var(--color-line)' }}>
                  <Td2><span style={{ fontFamily: 'var(--font-num)', fontWeight: 500, color: 'var(--color-accent)' }}>{o.id.replace('ORD-2026-', '')}</span></Td2>
                  <Td2><strong style={{ fontWeight: 500 }}>{o.customer} 様</strong></Td2>
                  <Td2 muted>{o.vehicle}</Td2>
                  <Td2 right num>{window.yen2(o.amount)}</Td2>
                  <Td2 right warn={o.overdue}>{o.due}{o.overdue && '・超過'}</Td2>
                </tr>
              ))}
              <tr style={{ borderBottom: '2px solid var(--color-line-strong)' }}>
                <td colSpan={3} style={{ padding: '14px 6px', fontSize: 13, fontWeight: 600, color: 'var(--color-ink)', letterSpacing: '0.08em' }}>合計</td>
                <td style={{ padding: '14px 6px', textAlign: 'right', fontFamily: 'var(--font-num)', fontSize: 20, fontWeight: 500, color: 'var(--color-ink)' }}>{window.yen2(unpaidYen)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 活動 */}
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="sec-label" style={{ marginBottom: 14 }}>本日の記録</div>
          <div>
            {window.ACTIVITY2.map((a, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '60px 50px 1fr', gap: 14, padding: '13px 0', borderBottom: '1px solid var(--color-line)', alignItems: 'baseline' }}>
                <div style={{ fontFamily: 'var(--font-num)', fontSize: 12, color: 'var(--color-ink-mid)', fontWeight: 500 }}>{a.time}</div>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-accent)', letterSpacing: '0.04em' }}>{a.who}</div>
                <div style={{ fontSize: 13.5, fontWeight: 400, color: 'var(--color-ink)', letterSpacing: '0.03em', lineHeight: 1.55 }}>{a.jp}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroStat2({ n, suffix, jp, warn }) {
  return (
    <div style={{ borderLeft: '1px solid rgba(255,255,255,0.14)', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontFamily: 'var(--font-num)', fontWeight: 300, fontSize: 56, color: warn ? '#d89880' : '#fff', letterSpacing: '-0.02em', lineHeight: 1 }}>
        {n}<span style={{ fontSize: 22, marginLeft: 4, fontWeight: 400 }}>{suffix}</span>
      </div>
      <div style={{ fontFamily: 'var(--font-jp)', fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.85)', letterSpacing: '0.12em' }}>{jp}</div>
    </div>
  );
}

function KpiCell2({ n, jp, delta, warn, last }) {
  return (
    <div style={{ padding: '22px 24px', borderRight: last ? 'none' : '1px solid var(--color-line)', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-ink-mid)', letterSpacing: '0.08em' }}>{jp}</div>
      <div className="num-big" style={{ fontSize: 32, color: warn ? 'var(--color-warn)' : 'var(--color-ink)', marginTop: 2 }}>{n}</div>
      <div style={{ fontSize: 12, color: warn ? 'var(--color-warn)' : 'var(--color-ink-light)', fontWeight: 500 }}>{delta}</div>
    </div>
  );
}

function Th2({ children, w, right }) {
  return <th style={{ padding: '12px 6px', fontFamily: 'var(--font-jp)', fontSize: 12, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--color-ink-mid)', textAlign: right ? 'right' : 'left', width: w }}>{children}</th>;
}
function Td2({ children, right, num, muted, warn }) {
  return <td style={{
    padding: '14px 6px',
    fontSize: 13.5,
    fontWeight: num ? 500 : 400,
    fontFamily: num ? 'var(--font-num)' : 'var(--font-jp)',
    color: warn ? 'var(--color-warn)' : muted ? 'var(--color-ink-mid)' : 'var(--color-ink)',
    letterSpacing: num ? '-0.005em' : '0.03em',
    textAlign: right ? 'right' : 'left',
    fontVariantNumeric: num ? 'tabular-nums' : 'normal',
  }}>{children}</td>;
}

// ============================================================
// C · 業務密度 (サイドバー型)
// 暗色サイドバー + 6連KPI + 要対応／未回収の2ペイン
// ============================================================
function DashboardC2() {
  return (
    <div className="wos-art" style={{ flexDirection: 'row' }}>
      <Sidebar2 active="dashboard" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {/* ヘッダー */}
        <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--color-line)', background: 'var(--color-paper)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12, color: 'var(--color-ink-light)', letterSpacing: '0.12em', marginBottom: 6 }}>2026年5月27日（水曜日）</div>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-jp)', fontWeight: 600, fontSize: 26, color: 'var(--color-ink)', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>本日の作業 — 作業中 11件</h2>
          </div>
          <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
            <button className="btn-ghost btn-sm">レポート出力</button>
            <button className="btn">新規受注を作成</button>
          </div>
        </div>

        {/* KPI */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', borderBottom: '1px solid var(--color-line)', background: 'var(--color-paper)' }}>
          {window.KPIS2.map((k, i) => (
            <div key={i} style={{ padding: '18px 20px', borderRight: i < 5 ? '1px solid var(--color-line)' : 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-ink-mid)', letterSpacing: '0.08em' }}>{k.jp}</div>
              <div className="num-big" style={{ fontSize: 28, color: k.warn ? 'var(--color-warn)' : 'var(--color-ink)', marginTop: 4 }}>{k.n}</div>
              <div style={{ fontSize: 11.5, fontWeight: 500, color: k.warn ? 'var(--color-warn)' : 'var(--color-ink-light)' }}>{k.delta}</div>
            </div>
          ))}
        </div>

        {/* 2ペイン */}
        <div className="body-area" style={{ padding: '24px 32px 28px', display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 32 }}>
          {/* 要対応 */}
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="sec-label">要対応の受注 <span className="count">4件</span></div>
            <div>
              {[
                { ord: window.ORDERS[2], reason: '請求期限超過 11日', warn: true },
                { ord: window.ORDERS[6], reason: '見積発行 未着手' },
                { ord: window.ORDERS[3], reason: '見積承認待ち（3日経過）' },
                { ord: window.ORDERS[5], reason: '本日 納車予定 15:00' },
              ].map((row, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 200px 90px', gap: 16, padding: '14px 0', borderBottom: '1px solid var(--color-line)', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-num)', fontWeight: 500, fontSize: 14, color: 'var(--color-accent)' }}>No. {row.ord.id.replace('ORD-2026-', '')}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--color-ink)', letterSpacing: '0.03em' }}>{row.ord.customer} 様</div>
                    <div style={{ fontSize: 12, color: 'var(--color-ink-mid)', marginTop: 2 }}>{row.ord.vehicle}</div>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 500, color: row.warn ? 'var(--color-warn)' : 'var(--color-ink-soft)' }}>{row.reason}</span>
                  <button className="btn-ghost btn-sm" style={{ width: '100%' }}>開く</button>
                </div>
              ))}
            </div>
          </div>

          {/* 未回収 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            <div className="sec-label">未回収 <span className="count">¥1,284,800</span></div>
            <div>
              {window.ORDERS.filter(o => o.inv === '請求済').map(o => (
                <div key={o.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 14, padding: '13px 0', borderBottom: '1px solid var(--color-line)', alignItems: 'baseline' }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--color-ink)', letterSpacing: '0.03em' }}>{o.customer} 様</div>
                    <div style={{ fontSize: 12, color: 'var(--color-ink-mid)', marginTop: 2 }}>
                      No. {o.id.replace('ORD-2026-', '')} ／ 期限 {o.due || '—'}
                      {o.overdue && <span style={{ color: 'var(--color-warn)', fontWeight: 600, marginLeft: 8 }}>期限超過</span>}
                    </div>
                  </div>
                  <span className="yen" style={{ fontSize: 16, fontWeight: 500, color: 'var(--color-ink)' }}>{window.yen2(o.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ====== サンプルデータ (v2用) =================================
window.KPIS2 = [
  { n: '11 件',     jp: '作業中',       delta: '月曜から +3' },
  { n: '4 件',      jp: '見積発行待ち', delta: '最古 3日' },
  { n: '7 件',      jp: '未回収',       delta: '¥1,284,800' },
  { n: '2 件',      jp: '期限超過',     delta: '要連絡', warn: true },
  { n: '¥3,420,000', jp: '今月売上',    delta: '前月比 +18%' },
  { n: '3 件',      jp: '在庫アラート', delta: 'SHOWA 油 41Φ ほか' },
];

window.TASKS2 = [
  { tag: '期限超過',     title: 'ORD-0150 田中 美咲 様 — 請求書',     sub: '請求額 ¥318,000 ／ 振込期限 2026/05/15', due: '11日経過', overdue: true },
  { tag: '見積発行',     title: 'ORD-0146 渡辺 慎一 様',              sub: '入庫から 7日経過 ／ 顧客から連絡あり',       due: '本日中' },
  { tag: '納車予定',     title: 'ORD-0147 中村 翔太 様 — BMW S1000RR', sub: '完了済 ／ 集金 ¥240,000（現金）',          due: '本日 15:00' },
  { tag: '部品到着',     title: 'KYB シールキット 36Φ ×3',            sub: '本日着 ／ 作業中 ORD-0151 で使用予定',        due: '本日 11:30' },
  { tag: '見積承認待ち', title: 'ORD-0149 鈴木 大輔 様',              sub: '見積発行から 3日経過 ／ 催促判断',              due: '要連絡' },
];

window.ACTIVITY2 = [
  { time: '14:22', who: '鈴木', jp: 'ORD-0152 山田 様 — 請求書を発行（¥286,400）' },
  { time: '13:48', who: '鈴木', jp: 'ORD-0147 中村 様 — 作業完了（BMW S1000RR）' },
  { time: '11:20', who: '佐藤', jp: 'ORD-0147 — 入金確認（¥240,000）' },
  { time: '10:55', who: '鈴木', jp: 'ORD-0152 — 新規入庫（HONDA CBR1000RR-R）' },
  { time: '09:30', who: '佐藤', jp: 'ORD-0149 鈴木 様 — 見積を発行（¥488,000）' },
  { time: '昨日',  who: '鈴木', jp: 'ÖHLINS シールキット ×3 を発注' },
];

Object.assign(window, { DashboardA2, DashboardB2, DashboardC2 });
