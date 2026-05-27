// screens2.jsx — 残りの画面 (顧客詳細 / 受注詳細 / 入金 / 売上 / 部品 / 設定)

// ============================================================
// 2. 顧客詳細 — 基本情報 + 保有車両 + 整備履歴
// ============================================================
function CustomerDetail() {
  const c = CUSTOMERS[0]; // 山田 太郎
  const vs = VEHICLES_YAMADA;
  return (
    <AppShell active="customers">
      {/* パンくず + 戻る */}
      <div style={{ padding: '16px 32px 0', flexShrink: 0 }}>
        <a style={{ fontSize: 12.5, color: 'var(--color-ink-mid)', letterSpacing: '0.06em' }}>← 顧客一覧に戻る</a>
      </div>
      <ScreenHead
        crumbs={`顧客管理 ／ ${c.id}`}
        title={`${c.name} 様`}
        gloss={`${c.kana} ／ 登録 2022/03/14 ／ 受注 ${HISTORY_YAMADA.length}件・累計 ¥${HISTORY_YAMADA.reduce((s,h)=>s+h.total,0).toLocaleString('en-US')}`}
        actions={<>
          <button className="btn-ghost btn-sm">削除</button>
          <button className="btn-ghost btn-sm">編集</button>
          <button className="btn">新規受注を作成</button>
        </>}
      />

      {/* タブ */}
      <div style={{ padding: '0 32px', borderBottom: '1px solid var(--color-line)', background: 'var(--color-paper)', display: 'flex', gap: 4, flexShrink: 0 }}>
        <Tab label="基本情報" active />
        <Tab label="整備履歴" badge={HISTORY_YAMADA.length} />
        <Tab label="保有車両" badge={vs.length} />
      </div>

      <div className="body-area" style={{ overflow: 'hidden', padding: '24px 32px', display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 28 }}>
        {/* 左: 基本情報カード */}
        <div>
          <div className="sec-label" style={{ marginBottom: 14 }}>基本情報</div>
          <div style={{ border: '1px solid var(--color-line)', background: 'var(--color-paper)', padding: '24px 28px' }}>
            <DL>
              <DT>顧客ID</DT><DD num>{c.id}</DD>
              <DT>フリガナ</DT><DD>{c.kana}</DD>
              <DT>電話番号</DT><DD num>{c.phone}</DD>
              <DT>メールアドレス</DT><DD>{c.email || '—'}</DD>
              <DT>郵便番号</DT><DD num>251-0037</DD>
              <DT>住所</DT><DD>神奈川県藤沢市鵠沼海岸 4-12-8</DD>
              <DT>メモ</DT><DD>{c.notes || '—'}</DD>
            </DL>
          </div>

          <div className="sec-label" style={{ marginTop: 24, marginBottom: 14 }}>保有車両 <span className="count">{vs.length}台</span></div>
          <div style={{ border: '1px solid var(--color-line)', background: 'var(--color-paper)' }}>
            {vs.map((v, i) => (
              <div key={v.id} style={{
                padding: '18px 22px',
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 12,
                borderBottom: i < vs.length - 1 ? '1px solid var(--color-line)' : 'none',
                alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-ink)', letterSpacing: '0.02em' }}>{v.maker} {v.model}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--color-ink-mid)', marginTop: 4 }}>
                    <span style={{ fontFamily: 'var(--font-num)' }}>{v.plate}</span> ／ 年式 {v.year} ／ 車台 {v.vin}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn-ghost btn-sm">編集</button>
                  <button className="btn-ghost btn-sm">削除</button>
                </div>
              </div>
            ))}
            <div style={{ padding: '14px 22px', borderTop: '1px solid var(--color-line)' }}>
              <button className="btn-ghost btn-sm">＋ 車両を追加</button>
            </div>
          </div>
        </div>

        {/* 右: 整備履歴 */}
        <div>
          <div className="sec-label" style={{ marginBottom: 14 }}>整備履歴 <span className="count">{HISTORY_YAMADA.length}件</span></div>
          <div>
            {HISTORY_YAMADA.map(h => (
              <div key={h.id} style={{
                display: 'grid',
                gridTemplateColumns: '80px 1fr auto',
                gap: 14,
                padding: '14px 0',
                borderBottom: '1px solid var(--color-line)',
                alignItems: 'baseline',
              }}>
                <div style={{ fontSize: 12.5, color: 'var(--color-ink-mid)', fontWeight: 500 }}>{h.date}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--color-ink)', letterSpacing: '0.03em' }}>{h.work}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--color-ink-light)', marginTop: 3 }}>
                    <span style={{ fontFamily: 'var(--font-num)', color: 'var(--color-accent)' }}>{h.id.replace('ORD-', '')}</span> ／ {h.vehicle}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="yen" style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-ink)' }}>¥{h.total.toLocaleString('en-US')}</div>
                  <div style={{ fontSize: 11, marginTop: 3 }}>
                    <StatusDot kind="inv" value={h.inv} size="11px" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Tab({ label, badge, active }) {
  return (
    <div style={{
      padding: '14px 18px',
      fontSize: 13.5,
      fontWeight: active ? 600 : 500,
      letterSpacing: '0.06em',
      color: active ? 'var(--color-ink)' : 'var(--color-ink-mid)',
      borderBottom: active ? '2px solid var(--color-accent)' : '2px solid transparent',
      cursor: 'pointer',
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      {label}
      {badge != null && <span style={{ fontSize: 11, fontFamily: 'var(--font-num)', color: 'var(--color-ink-light)' }}>{badge}</span>}
    </div>
  );
}

function DL({ children }) {
  return <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '120px 1fr', rowGap: 14, columnGap: 16 }}>{children}</dl>;
}
function DT({ children }) {
  return <dt style={{ fontSize: 12, color: 'var(--color-ink-light)', letterSpacing: '0.12em', fontWeight: 500, paddingTop: 2 }}>{children}</dt>;
}
function DD({ children, num }) {
  return <dd style={{ margin: 0, fontSize: 13.5, color: 'var(--color-ink)', fontFamily: num ? 'var(--font-num)' : 'var(--font-jp)', letterSpacing: num ? '-0.005em' : '0.03em', fontWeight: 500 }}>{children}</dd>;
}

// ============================================================
// 3. 受注詳細
// ============================================================
function OrderDetail() {
  const o = ORDER_DETAIL;
  const itemsSub = o.items.reduce((s, i) => s + i.sub, 0);
  const tax = Math.floor(itemsSub * 0.10);
  const total = itemsSub + tax;
  return (
    <AppShell active="orders">
      <div style={{ padding: '16px 32px 0', flexShrink: 0 }}>
        <a style={{ fontSize: 12.5, color: 'var(--color-ink-mid)', letterSpacing: '0.06em' }}>← 受注一覧に戻る</a>
      </div>
      <ScreenHead
        crumbs={`受注一覧 ／ ${o.id}`}
        title={`${o.id}  ${o.customer.name} 様`}
        gloss={`受付日 ${o.date} ／ ${o.vehicle.maker} ${o.vehicle.model}`}
        actions={<>
          <button className="btn-ghost btn-sm">アーカイブ</button>
          <button className="btn-ghost btn-sm">受注情報を編集</button>
          <button className="btn-ghost btn-sm">見積書を出力</button>
          <button className="btn">請求書を出力</button>
        </>}
      />

      {/* ステータスバー */}
      <div style={{
        padding: '16px 32px',
        borderBottom: '1px solid var(--color-line)',
        background: 'var(--color-paper)',
        display: 'flex', gap: 24, alignItems: 'center',
        flexShrink: 0,
      }}>
        <StatusStepper label="作業" kind="work" value={o.work} />
        <span className="vhair" style={{ height: 24 }}></span>
        <StatusStepper label="見積" kind="est" value={o.est} />
        <span className="vhair" style={{ height: 24 }}></span>
        <StatusStepper label="請求" kind="inv" value={o.inv} />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 14, alignItems: 'baseline' }}>
          <span style={{ fontSize: 12, color: 'var(--color-ink-light)', letterSpacing: '0.12em', fontWeight: 500 }}>請求合計 (税込)</span>
          <span className="num-big" style={{ fontSize: 26, color: 'var(--color-ink)' }}>{yen2(total)}</span>
        </div>
      </div>

      <div className="body-area" style={{ overflow: 'hidden', padding: '20px 32px', display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24 }}>
        {/* 中央: 明細 */}
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* メモ */}
          <div style={{ border: '1px solid var(--color-line)', background: 'var(--color-paper)', padding: '14px 18px' }}>
            <div style={{ fontSize: 11, color: 'var(--color-ink-light)', letterSpacing: '0.16em', fontWeight: 600, marginBottom: 6 }}>受注メモ</div>
            <div style={{ fontSize: 13, color: 'var(--color-ink-soft)', letterSpacing: '0.03em', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{o.notes}</div>
          </div>

          {/* 明細 */}
          <div>
            <div className="sec-label" style={{ marginBottom: 10 }}>明細 <span className="count">{o.items.length}項目</span></div>
            <div style={{ border: '1px solid var(--color-line)', background: 'var(--color-paper)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--color-line-strong)', background: 'var(--color-cream)' }}>
                    <ThS w="10%">区分</ThS>
                    <ThS>項目</ThS>
                    <ThS w="8%" right>数量</ThS>
                    <ThS w="14%" right>単価</ThS>
                    <ThS w="14%" right>小計</ThS>
                  </tr>
                </thead>
                <tbody>
                  {o.items.map((it, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--color-line)' }}>
                      <td style={{ padding: '9px 12px', verticalAlign: 'middle' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          fontSize: 11,
                          fontWeight: 500,
                          letterSpacing: '0.12em',
                          color: it.cat === '部品' ? 'var(--color-accent)' : 'var(--color-ink-mid)',
                          border: `1px solid ${it.cat === '部品' ? 'var(--color-accent)' : 'var(--color-line-strong)'}`,
                        }}>{it.cat}</span>
                      </td>
                      <td style={{ padding: '9px 12px', fontSize: 13.5, fontWeight: 500, color: 'var(--color-ink)', letterSpacing: '0.03em' }}>{it.name}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'var(--font-num)', fontSize: 13.5, fontVariantNumeric: 'tabular-nums' }}>{it.qty}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'var(--font-num)', fontSize: 13.5, fontVariantNumeric: 'tabular-nums', color: 'var(--color-ink-mid)' }}>¥{it.unit.toLocaleString('en-US')}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'var(--font-num)', fontSize: 14, fontWeight: 500, color: 'var(--color-ink)', fontVariantNumeric: 'tabular-nums' }}>¥{it.sub.toLocaleString('en-US')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 18px', borderTop: '1px solid var(--color-line)' }}>
                <button className="btn-ghost btn-sm">メニューから追加</button>
                <button className="btn-ghost btn-sm">セットから追加</button>
                <button className="btn-ghost btn-sm">＋ 明細を追加</button>
              </div>
            </div>
          </div>

          {/* 合計欄 (右寄せ) */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ minWidth: 320, border: '1px solid var(--color-line-strong)', background: 'var(--color-paper)', padding: '16px 20px' }}>
              <SumRow label="小計"        value={`¥${itemsSub.toLocaleString('en-US')}`} />
              <SumRow label="値引き"      value="¥0" muted />
              <SumRow label="消費税 (10%)" value={`¥${tax.toLocaleString('en-US')}`} muted />
              <div style={{ height: 1, background: 'var(--color-ink)', margin: '8px 0' }}></div>
              <SumRow label="請求合計 (税込)" value={`¥${total.toLocaleString('en-US')}`} strong />
            </div>
          </div>
        </div>

        {/* 右: 顧客 / 車両 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <SideCard title="顧客">
            <DL>
              <DT>顧客名</DT><DD>{o.customer.name} 様</DD>
              <DT>フリガナ</DT><DD>{o.customer.kana}</DD>
              <DT>電話</DT><DD num>{o.customer.phone}</DD>
              <DT>住所</DT><DD>{o.customer.address}</DD>
            </DL>
            <a style={{ display: 'block', marginTop: 12, fontSize: 12, color: 'var(--color-accent)', fontWeight: 500, letterSpacing: '0.06em' }}>顧客詳細を開く →</a>
          </SideCard>
          <SideCard title="車両">
            <DL>
              <DT>ナンバー</DT><DD num>{o.vehicle.plate}</DD>
              <DT>メーカー</DT><DD>{o.vehicle.maker}</DD>
              <DT>車種</DT><DD>{o.vehicle.model}</DD>
              <DT>年式</DT><DD num>{o.vehicle.year}年</DD>
              <DT>車台番号</DT><DD num>{o.vehicle.vin}</DD>
            </DL>
          </SideCard>
          <SideCard title="振込期限">
            <div style={{ fontFamily: 'var(--font-num)', fontSize: 18, fontWeight: 500, color: 'var(--color-ink)' }}>{o.due}</div>
            <div style={{ fontSize: 12, color: 'var(--color-ink-mid)', marginTop: 4 }}>本日から 28日後</div>
          </SideCard>
        </div>
      </div>
    </AppShell>
  );
}

function StatusStepper({ label, kind, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--color-ink-light)', letterSpacing: '0.16em' }}>{label}</span>
      <StatusDot kind={kind} value={value} />
    </div>
  );
}
function SumRow({ label, value, muted, strong }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '5px 0' }}>
      <span style={{ fontSize: strong ? 13.5 : 12.5, fontWeight: strong ? 600 : 500, color: muted ? 'var(--color-ink-mid)' : 'var(--color-ink)', letterSpacing: '0.05em' }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-num)', fontSize: strong ? 20 : 14, fontWeight: strong ? 600 : 500, color: muted ? 'var(--color-ink-mid)' : 'var(--color-ink)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}
function SideCard({ title, children }) {
  return (
    <div style={{ border: '1px solid var(--color-line)', background: 'var(--color-paper)', padding: '16px 18px' }}>
      <div style={{ fontSize: 11, color: 'var(--color-ink-light)', letterSpacing: '0.16em', fontWeight: 600, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}

Object.assign(window, {
  CustomerDetail, OrderDetail, Tab, DL, DT, DD, SideCard, SumRow,
});
