// orders2.jsx — v2 受注一覧3案 (日本語のみ・視認性重視)

// ============================================================
// A · 一覧テーブル型
// 検索 + フィルタチップ + 細罫テーブル。ステータスは縦並びのドット+ラベル。
// ============================================================
function OrdersA2() {
  return (
    <div className="wos-art">
      <TopNav2 active="orders" />

      <PageHead2
        crumbs="ダッシュボード ／ 受注一覧"
        title="受注一覧"
        gloss="進行中の受注 48件。最新の入庫順に表示しています。"
        actions={<>
          <button className="btn-ghost">アーカイブ</button>
          <button className="btn">新規受注を作成</button>
        </>}
      />

      {/* 検索・フィルタバー */}
      <div style={{ padding: '0 40px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div className="search">
          <span className="ico">⌕</span>
          <input placeholder="管理番号・顧客名・車種・メモで検索…" />
          <span className="key">⌘ K</span>
        </div>
        <span style={{ fontSize: 12, color: 'var(--color-ink-light)', letterSpacing: '0.1em', marginLeft: 4 }}>絞り込み</span>
        <span className="chip active">すべて <span className="ct">48</span></span>
        <span className="chip">受付 <span className="ct">4</span></span>
        <span className="chip">作業中 <span className="ct">11</span></span>
        <span className="chip">完了 <span className="ct">33</span></span>
        <span style={{ width: 1, height: 18, background: 'var(--color-line)' }}></span>
        <span className="chip">未請求 <span className="ct">5</span></span>
        <span className="chip">期限超過 <span className="ct">2</span></span>
      </div>

      <div className="body-area" style={{ padding: '0 40px 28px', minHeight: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-jp)' }}>
          <thead>
            <tr style={{ borderTop: '1px solid var(--color-line)', borderBottom: '2px solid var(--color-line-strong)', background: 'var(--color-paper)' }}>
              <ThO w="12%">管理番号</ThO>
              <ThO w="11%">入庫日</ThO>
              <ThO w="17%">顧客</ThO>
              <ThO w="22%">車両</ThO>
              <ThO w="26%">状態</ThO>
              <ThO w="12%" right>金額</ThO>
            </tr>
          </thead>
          <tbody>
            {window.ORDERS.map((o, i) => (
              <tr key={o.id} style={{ borderBottom: '1px solid var(--color-line)', background: i % 2 === 1 ? 'var(--color-paper)' : 'transparent' }}>
                <TdO>
                  <div style={{ fontFamily: 'var(--font-num)', fontSize: 15, fontWeight: 500, color: 'var(--color-accent)', letterSpacing: '0.02em' }}>{o.id.replace('ORD-2026-', '')}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-ink-light)', marginTop: 2 }}>2026年度</div>
                </TdO>
                <TdO>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--color-ink)' }}>{o.date}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-ink-light)', marginTop: 2 }}>{window.daysAgo2(o.date)}日経過</div>
                </TdO>
                <TdO>
                  <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-ink)', letterSpacing: '0.03em' }}>{o.customer} 様</div>
                  <div style={{ fontSize: 11.5, color: 'var(--color-ink-light)', marginTop: 2 }}>{o.kana}</div>
                </TdO>
                <TdO>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--color-ink)', letterSpacing: '0.02em' }}>{o.vehicle}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--color-ink-light)', marginTop: 2 }}>{o.plate}</div>
                </TdO>
                <TdO>
                  <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr', rowGap: 5, columnGap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: 'var(--color-ink-light)', fontWeight: 500 }}>作業</span>
                    <StatusDot kind="work" value={o.work} />
                    <span style={{ fontSize: 11, color: 'var(--color-ink-light)', fontWeight: 500 }}>見積</span>
                    <StatusDot kind="est"  value={o.est} />
                    <span style={{ fontSize: 11, color: 'var(--color-ink-light)', fontWeight: 500 }}>請求</span>
                    <StatusDot kind="inv"  value={o.inv} overdue={o.overdue && o.inv === '請求済'} />
                  </div>
                </TdO>
                <TdO right>
                  <div className="yen" style={{ fontSize: 15.5, fontWeight: 500, color: 'var(--color-ink)' }}>{window.yen2(o.amount)}</div>
                  <div style={{ marginTop: 6, fontSize: 11.5, fontWeight: 500, color: 'var(--color-accent)', letterSpacing: '0.06em' }}>詳細を開く →</div>
                </TdO>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ThO({ children, w, right }) {
  return <th style={{ padding: '14px 10px', fontFamily: 'var(--font-jp)', fontSize: 12, fontWeight: 600, letterSpacing: '0.14em', color: 'var(--color-ink-mid)', textAlign: right ? 'right' : 'left', width: w, verticalAlign: 'middle' }}>{children}</th>;
}
function TdO({ children, right }) {
  return <td style={{ padding: '16px 10px', textAlign: right ? 'right' : 'left', verticalAlign: 'top' }}>{children}</td>;
}

// ============================================================
// B · 行カード型 (受注帳)
// 1件あたり大きく、車両名を太く、ステータスは横3レール
// ============================================================
function OrdersB2() {
  return (
    <div className="wos-art">
      <TopNav2 active="orders" />

      <PageHead2
        crumbs="ダッシュボード ／ 受注一覧"
        title="受注一覧"
        gloss="進行中の受注 48件。1件ずつ、状況を見渡せる形式で表示しています。"
        actions={<>
          <button className="btn-ghost">アーカイブ</button>
          <button className="btn">新規受注を作成</button>
        </>}
      />

      <div style={{ padding: '0 40px 18px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div className="search">
          <span className="ico">⌕</span>
          <input placeholder="管理番号・顧客名・車種・メモで検索…" />
          <span className="key">⌘ K</span>
        </div>
        <span style={{ fontSize: 12, color: 'var(--color-ink-light)', letterSpacing: '0.1em' }}>並び替え</span>
        <span className="chip active">最新の入庫順</span>
        <span className="chip">期限が近い順</span>
        <span className="chip">金額順</span>
      </div>

      <div className="body-area" style={{ padding: '0 40px 28px', overflow: 'hidden' }}>
        <div style={{ borderTop: '1px solid var(--color-line)' }}>
          {window.ORDERS.slice(0, 6).map(o => <OrderRow2 key={o.id} o={o} />)}
        </div>
      </div>
    </div>
  );
}

function OrderRow2({ o }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '120px 1fr 280px 200px 50px',
      gap: 28,
      padding: '22px 0',
      borderBottom: '1px solid var(--color-line)',
      alignItems: 'center',
    }}>
      {/* 番号 + 日付 */}
      <div>
        <div style={{ fontSize: 11, color: 'var(--color-ink-light)', fontWeight: 500, letterSpacing: '0.1em' }}>管理番号</div>
        <div style={{ fontFamily: 'var(--font-num)', fontSize: 26, fontWeight: 500, color: o.overdue ? 'var(--color-warn)' : 'var(--color-accent)', letterSpacing: '0.01em', lineHeight: 1.1, marginTop: 4 }}>{o.id.replace('ORD-2026-', '')}</div>
        <div style={{ fontSize: 12, color: 'var(--color-ink-mid)', marginTop: 6, fontWeight: 500 }}>{o.date}</div>
        <div style={{ fontSize: 11, color: 'var(--color-ink-light)', marginTop: 2 }}>{window.daysAgo2(o.date)}日経過</div>
      </div>

      {/* 顧客 + 車両 + メモ */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 19, fontWeight: 600, color: 'var(--color-ink)', letterSpacing: '0.02em', lineHeight: 1.3 }}>{o.vehicle}</div>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-ink-soft)', marginTop: 6, letterSpacing: '0.04em' }}>
          {o.customer} 様 <span style={{ color: 'var(--color-ink-light)', fontWeight: 400 }}>／ {o.kana} ／ {o.plate}</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-ink-mid)', marginTop: 10, letterSpacing: '0.03em', lineHeight: 1.6, maxWidth: 560, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {o.notes}
        </div>
      </div>

      {/* ステータス3行 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <StatRail label="作業" kind="work" value={o.work} />
        <StatRail label="見積" kind="est"  value={o.est} />
        <StatRail label="請求" kind="inv"  value={o.inv} overdue={o.overdue && o.inv === '請求済'} />
      </div>

      {/* 金額 + 期限 */}
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 11, color: 'var(--color-ink-light)', fontWeight: 500, letterSpacing: '0.1em' }}>金額</div>
        <div className="num-big" style={{ fontSize: 26, color: 'var(--color-ink)', marginTop: 6 }}>{window.yen2(o.amount)}</div>
        {o.due && (
          <div style={{ marginTop: 8, fontSize: 12, fontWeight: 500, color: o.overdue ? 'var(--color-warn)' : 'var(--color-ink-mid)' }}>
            振込期限 {o.due}{o.overdue && '（超過）'}
          </div>
        )}
        {!o.amount && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-ink-light)', fontWeight: 500 }}>見積前</div>
        )}
      </div>

      <div style={{ textAlign: 'right', fontSize: 22, color: 'var(--color-accent)', fontWeight: 400 }}>→</div>
    </div>
  );
}

function StatRail({ label, kind, value, overdue }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '54px 1fr', gap: 12, alignItems: 'center' }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-ink-light)', letterSpacing: '0.16em', borderRight: '1px solid var(--color-line)', paddingRight: 8 }}>{label}</span>
      <StatusDot kind={kind} value={value} overdue={overdue} />
    </div>
  );
}

// ============================================================
// C · 作業台ボード (サイドバー型)
// 3カラムカンバン: 受付 / 作業中 / 完了
// ============================================================
function OrdersC2() {
  const byStatus = {
    '受付':   window.ORDERS.filter(o => o.work === '受付'),
    '作業中': window.ORDERS.filter(o => o.work === '作業中'),
    '完了':   window.ORDERS.filter(o => o.work === '完了'),
  };

  return (
    <div className="wos-art" style={{ flexDirection: 'row' }}>
      <Sidebar2 active="orders" />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {/* ヘッダー */}
        <div style={{ padding: '22px 28px', borderBottom: '1px solid var(--color-line)', background: 'var(--color-paper)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--color-ink-light)', letterSpacing: '0.12em', marginBottom: 6 }}>ダッシュボード ／ 受注一覧</div>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-jp)', fontWeight: 600, fontSize: 26, color: 'var(--color-ink)', letterSpacing: '0.02em' }}>作業台ボード — 進行中の受注 48件</h2>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className="chip">作業台</span>
            <span className="chip active">一覧表</span>
            <button className="btn" style={{ marginLeft: 8 }}>新規受注を作成</button>
          </div>
        </div>

        {/* 検索 */}
        <div style={{ padding: '14px 28px', borderBottom: '1px solid var(--color-line)', background: 'var(--color-paper)', display: 'flex', gap: 14, alignItems: 'center' }}>
          <div className="search" style={{ maxWidth: 420 }}>
            <span className="ico">⌕</span>
            <input placeholder="管理番号・顧客名・車種で検索…" />
          </div>
          <span style={{ fontSize: 12, color: 'var(--color-ink-light)', letterSpacing: '0.1em' }}>担当</span>
          <span className="chip active">全員</span>
          <span className="chip">鈴木</span>
          <span className="chip">佐藤</span>
        </div>

        {/* カンバン */}
        <div className="body-area" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--color-line)' }}>
          {[
            { jp: '受付',   desc: '入庫したばかり' },
            { jp: '作業中', desc: 'メカニックの手元' },
            { jp: '完了',   desc: '納車・請求待ち' },
          ].map((c, ci) => {
            const items = byStatus[c.jp];
            return (
              <div key={c.jp} style={{
                background: ci === 1 ? 'var(--color-paper)' : 'var(--color-cream)',
                padding: '18px 20px',
                display: 'flex', flexDirection: 'column', gap: 12,
                minHeight: 0, overflow: 'hidden',
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-ink)', letterSpacing: '0.04em' }}>{c.jp}</span>
                    <span style={{ fontSize: 12, color: 'var(--color-ink-light)', fontWeight: 500 }}>{c.desc}</span>
                  </div>
                  <span className="num-big" style={{ fontSize: 22, color: 'var(--color-accent)' }}>{items.length}<span style={{ fontSize: 12, color: 'var(--color-ink-light)', marginLeft: 4 }}>件</span></span>
                </div>
                <div className="hair"></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
                  {items.map(o => <BoardCard2 key={o.id} o={o} active={ci === 1} />)}
                  {items.length === 0 && (
                    <div style={{ fontSize: 13, color: 'var(--color-ink-light)', padding: '24px 0', textAlign: 'center', fontWeight: 500 }}>該当なし</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function BoardCard2({ o, active }) {
  return (
    <div style={{
      background: active ? 'var(--color-cream)' : 'var(--color-paper)',
      border: '1px solid var(--color-line)',
      padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: 'var(--font-num)', fontSize: 16, fontWeight: 500, color: o.overdue ? 'var(--color-warn)' : 'var(--color-accent)' }}>No. {o.id.replace('ORD-2026-', '')}</span>
        <span style={{ fontSize: 12, color: 'var(--color-ink-light)', fontWeight: 500 }}>{o.date.slice(5)}</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-ink)', letterSpacing: '0.02em', lineHeight: 1.35 }}>{o.vehicle}</div>
      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-ink-soft)' }}>{o.customer} 様 <span style={{ color: 'var(--color-ink-light)', fontWeight: 400 }}>／ {o.plate}</span></div>
      <div style={{ fontSize: 12, color: 'var(--color-ink-mid)', letterSpacing: '0.02em', lineHeight: 1.55, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
        {o.notes}
      </div>
      <div className="hair"></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <MiniStat label="見積" kind="est" value={o.est} />
          <MiniStat label="請求" kind="inv" value={o.inv} overdue={o.overdue && o.inv === '請求済'} />
        </div>
        <span className="yen" style={{ fontSize: 15, fontWeight: 500, color: 'var(--color-ink)' }}>{window.yen2(o.amount)}</span>
      </div>
    </div>
  );
}

function MiniStat({ label, kind, value, overdue }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 10.5, color: 'var(--color-ink-light)', fontWeight: 600, letterSpacing: '0.14em' }}>{label}</span>
      <span className={`status ${window.statusClass(kind, value, overdue)}`} style={{ fontSize: 11.5, gap: 5 }}>
        <span className="dot" style={{ width: 6, height: 6 }}></span>
        <span>{value}</span>
      </span>
    </span>
  );
}

Object.assign(window, { OrdersA2, OrdersB2, OrdersC2 });
