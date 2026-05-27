// screens3.jsx — 入金 / 売上 / 部品 / 設定

// ============================================================
// 4. 入金管理
// ============================================================
function PaymentsScreen() {
  const overdue  = PAYMENTS.filter(p => p.status === 'overdue').length;
  const dueSoon  = PAYMENTS.filter(p => p.status === 'due_soon').length;
  const onTrack  = PAYMENTS.filter(p => p.status === 'on_track').length;
  const totalAmt = PAYMENTS.reduce((s, p) => s + p.amount, 0);
  return (
    <AppShell active="payments">
      <ScreenHead
        crumbs="会計"
        title="入金管理"
        gloss={`未回収 ${PAYMENTS.length} 件・合計 ¥${totalAmt.toLocaleString('en-US')}。期限超過 ${overdue} 件は要連絡。`}
        actions={<>
          <button className="btn-ghost btn-sm">CSV書き出し</button>
          <button className="btn-ghost btn-sm">督促状の作成</button>
        </>}
      />
      {/* サマリー帯 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: '1px solid var(--color-line)', background: 'var(--color-paper)', flexShrink: 0 }}>
        <PaySum jp="未回収合計"     n={`¥${totalAmt.toLocaleString('en-US')}`} sub={`${PAYMENTS.length}件`} />
        <PaySum jp="期限超過"       n={`${overdue}件`}  sub="要連絡"     warn />
        <PaySum jp="期限間近 (7日内)" n={`${dueSoon}件`}  sub="要確認" />
        <PaySum jp="期限内"         n={`${onTrack}件`} sub="経過観察" last />
      </div>

      {/* 検索 */}
      <div style={{ padding: '18px 32px', borderBottom: '1px solid var(--color-line)', background: 'var(--color-paper)', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
        <div className="search" style={{ maxWidth: 460 }}>
          <span className="ico">⌕</span>
          <input placeholder="管理番号・顧客名・期限で検索…" />
        </div>
        <span className="chip active">すべて <span className="ct">{PAYMENTS.length}</span></span>
        <span className="chip">期限超過 <span className="ct">{overdue}</span></span>
        <span className="chip">期限間近 <span className="ct">{dueSoon}</span></span>
        <span className="chip">期限内 <span className="ct">{onTrack}</span></span>
      </div>

      <div className="body-area" style={{ overflow: 'hidden', padding: '20px 32px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderTop: '1px solid var(--color-line)', borderBottom: '2px solid var(--color-line-strong)', background: 'var(--color-paper)' }}>
              <ThS w="14%">管理番号</ThS>
              <ThS w="18%">顧客</ThS>
              <ThS w="13%">請求日</ThS>
              <ThS w="13%">振込期限</ThS>
              <ThS w="14%">状態</ThS>
              <ThS w="14%" right>金額</ThS>
              <ThS w="14%" right>操作</ThS>
            </tr>
          </thead>
          <tbody>
            {PAYMENTS.map((p, i) => (
              <tr key={p.id} style={{ borderBottom: '1px solid var(--color-line)', background: i % 2 === 1 ? 'var(--color-paper)' : 'transparent' }}>
                <TdS num><span style={{ color: 'var(--color-accent)', fontWeight: 500 }}>{p.id.replace('ORD-2026-', 'No. ')}</span></TdS>
                <TdS><strong style={{ fontWeight: 600 }}>{p.customer} 様</strong></TdS>
                <TdS num muted>{p.invoiced}</TdS>
                <TdS num muted={p.status !== 'overdue'}>
                  {p.status === 'overdue'
                    ? <span style={{ color: 'var(--color-warn)', fontWeight: 600 }}>{p.due}</span>
                    : p.due}
                </TdS>
                <TdS>
                  {p.status === 'overdue'  && <PayBadge tone="warn" label={`${p.days}日超過`} />}
                  {p.status === 'due_soon' && <PayBadge tone="busy" label={`残り ${p.days}日`} />}
                  {p.status === 'on_track' && <PayBadge tone="go"   label={`期限内 (${p.days}日)`} />}
                </TdS>
                <TdS right num><strong style={{ fontWeight: 600, fontSize: 14.5 }}>¥{p.amount.toLocaleString('en-US')}</strong></TdS>
                <TdS right><button className="btn-ghost btn-sm">入金確認</button></TdS>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

function PaySum({ jp, n, sub, warn, last }) {
  return (
    <div style={{ padding: '22px 24px', borderRight: last ? 'none' : '1px solid var(--color-line)', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-ink-mid)', letterSpacing: '0.1em' }}>{jp}</div>
      <div className="num-big" style={{ fontSize: 30, color: warn ? 'var(--color-warn)' : 'var(--color-ink)' }}>{n}</div>
      <div style={{ fontSize: 12, color: warn ? 'var(--color-warn)' : 'var(--color-ink-light)', fontWeight: 500 }}>{sub}</div>
    </div>
  );
}
function PayBadge({ tone, label }) {
  const bg = { warn: 'rgba(184,80,64,0.10)', busy: 'rgba(63,91,122,0.10)', go: 'rgba(65,104,93,0.10)' }[tone];
  const fg = { warn: '#b85040', busy: '#3f5b7a', go: '#41685d' }[tone];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 10px', background: bg, color: fg,
      fontSize: 12, fontWeight: 600, letterSpacing: '0.04em',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: fg }}></span>
      {label}
    </span>
  );
}

// ============================================================
// 5. 売上集計
// ============================================================
function SalesScreen() {
  const s = SALES_MONTH;
  return (
    <AppShell active="sales">
      <ScreenHead
        crumbs="会計"
        title="売上集計"
        gloss="請求書発行日 (invoiced_at) ベースで月次集計。 作業完了が「売上」、未完了は「前受金」。"
        actions={<>
          <button className="btn-ghost btn-sm">CSV書き出し</button>
          <button className="btn-ghost btn-sm">税理士向けPDF</button>
        </>}
      />
      {/* 月ナビ */}
      <div style={{ padding: '14px 32px', borderBottom: '1px solid var(--color-line)', background: 'var(--color-paper)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button className="btn-ghost btn-sm">← 前月</button>
          <h3 style={{ margin: 0, fontFamily: 'var(--font-jp)', fontWeight: 600, fontSize: 18, color: 'var(--color-ink)', letterSpacing: '0.04em', minWidth: 140, textAlign: 'center' }}>{s.year}年 {s.month}月</h3>
          <button className="btn-ghost btn-sm">翌月 →</button>
        </div>
        <button className="btn-ghost btn-sm">今月へ</button>
      </div>

      <div className="body-area" style={{ overflow: 'hidden', padding: '22px 32px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        {/* サマリー 4枚 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'var(--color-line)', border: '1px solid var(--color-line)' }}>
          <SalesCard label="売上"        sub="作業完了 + 請求済 (税抜)" n={s.sales} />
          <SalesCard label="前受金"      sub="作業未完了 + 請求済 (税抜)" n={s.advance} />
          <SalesCard label="消費税"      sub="税率 10%" n={s.tax} />
          <SalesCard label="請求合計"    sub={`税込・${s.rows.length}件`} n={s.total} strong />
        </div>

        {/* キャッシュフロー帯 */}
        <div style={{ border: '1px solid var(--color-line)', background: 'var(--color-paper)', padding: '14px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 11.5, color: 'var(--color-accent)', fontWeight: 600, letterSpacing: '0.16em' }}>請求合計の内訳 (キャッシュフロー)</div>
          <div style={{ display: 'flex', gap: 36 }}>
            <CashRow label="うち入金済"   amount={s.paid}   count={s.paidCount} />
            <CashRow label="うち未入金"   amount={s.unpaid} count={s.unpaidCount} link />
          </div>
        </div>

        {/* カテゴリ別 + 税区分別 */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 22 }}>
          <div>
            <div className="sec-label" style={{ marginBottom: 10 }}>業務カテゴリ別</div>
            <div style={{ border: '1px solid var(--color-line)', background: 'var(--color-paper)' }}>
              {s.categories.map((c, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 160px', padding: '11px 18px', borderBottom: i < s.categories.length-1 ? '1px solid var(--color-line)' : 'none', alignItems: 'center' }}>
                  <span style={{ fontSize: 13.5, color: 'var(--color-ink)', fontWeight: 500, letterSpacing: '0.03em' }}>{c.name}</span>
                  <div style={{ height: 6, background: 'var(--color-line)' }}>
                    <div style={{ height: 6, width: `${(c.sub / 1820000) * 100}%`, background: 'var(--color-accent)' }}></div>
                  </div>
                  <span style={{ textAlign: 'right', fontFamily: 'var(--font-num)', fontSize: 14, fontWeight: 500, color: 'var(--color-ink)', fontVariantNumeric: 'tabular-nums' }}>¥{c.sub.toLocaleString('en-US')}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 18px', borderTop: '2px solid var(--color-line-strong)', background: 'var(--color-cream)' }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-ink)', letterSpacing: '0.05em' }}>合計</span>
                <span style={{ fontFamily: 'var(--font-num)', fontSize: 16, fontWeight: 600, color: 'var(--color-ink)', fontVariantNumeric: 'tabular-nums' }}>¥{s.categories.reduce((sum,c)=>sum+c.sub,0).toLocaleString('en-US')}</span>
              </div>
            </div>
          </div>
          <div>
            <div className="sec-label" style={{ marginBottom: 10 }}>税区分別</div>
            <div style={{ border: '1px solid var(--color-line)', background: 'var(--color-paper)' }}>
              <SumRow2 label="課税対象"      n={s.taxBuckets.taxable} />
              <SumRow2 label="車検法定費用"  n={s.taxBuckets.nonTax} />
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 18px', borderTop: '2px solid var(--color-line-strong)', background: 'var(--color-cream)' }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-ink)', letterSpacing: '0.05em' }}>合計</span>
                <span style={{ fontFamily: 'var(--font-num)', fontSize: 16, fontWeight: 600, color: 'var(--color-ink)', fontVariantNumeric: 'tabular-nums' }}>¥{(s.taxBuckets.taxable + s.taxBuckets.nonTax).toLocaleString('en-US')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function SalesCard({ label, sub, n, strong }) {
  return (
    <div style={{ background: strong ? 'var(--color-ink)' : 'var(--color-paper)', color: strong ? '#fff' : 'var(--color-ink)', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.18em', color: strong ? 'rgba(255,255,255,0.7)' : 'var(--color-ink-mid)' }}>{label}</div>
      <div style={{ fontSize: 11, color: strong ? 'rgba(255,255,255,0.55)' : 'var(--color-ink-light)', fontWeight: 500 }}>{sub}</div>
      <div className="num-big" style={{ fontSize: 30, color: strong ? '#fff' : 'var(--color-ink)', marginTop: 6 }}>¥{n.toLocaleString('en-US')}</div>
    </div>
  );
}
function CashRow({ label, amount, count, link }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
      <span style={{ fontSize: 12.5, color: 'var(--color-ink-mid)', fontWeight: 500 }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-num)', fontSize: 17, fontWeight: 500, color: link ? 'var(--color-accent)' : 'var(--color-ink)', fontVariantNumeric: 'tabular-nums', textDecoration: link ? 'underline' : 'none', textUnderlineOffset: 3 }}>¥{amount.toLocaleString('en-US')}</span>
      <span style={{ fontSize: 11.5, color: 'var(--color-ink-light)' }}>({count}件{link ? ' →' : ''})</span>
    </div>
  );
}
function SumRow2({ label, n }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 18px', borderBottom: '1px solid var(--color-line)' }}>
      <span style={{ fontSize: 13.5, color: 'var(--color-ink)', fontWeight: 500 }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-num)', fontSize: 14, fontWeight: 500, color: 'var(--color-ink)', fontVariantNumeric: 'tabular-nums' }}>¥{n.toLocaleString('en-US')}</span>
    </div>
  );
}

// ============================================================
// 6. 部品在庫
// ============================================================
function PartsScreen() {
  const lowOrOut = PARTS.filter(p => p.status !== 'ok').length;
  return (
    <AppShell active="parts">
      <ScreenHead
        crumbs="工房"
        title="部品在庫"
        gloss="部品の原価・売価・在庫数を一元管理。 発注点を下回ると赤色で通知します。"
        actions={<>
          <button className="btn-ghost btn-sm">CSV書き出し</button>
          <button className="btn">＋ 新規登録</button>
        </>}
      />

      {/* 発注アラート */}
      <div style={{ padding: '14px 32px', borderBottom: '1px solid var(--color-line)', background: 'rgba(184,80,64,0.06)', display: 'flex', alignItems: 'center', gap: 18, flexShrink: 0 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-warn)' }}></span>
        <strong style={{ fontSize: 13.5, color: 'var(--color-warn)', fontWeight: 600, letterSpacing: '0.04em' }}>発注が必要: {lowOrOut} 件</strong>
        <a style={{ fontSize: 12, color: 'var(--color-warn)', textDecoration: 'underline', textUnderlineOffset: 3 }}>発注が必要なものだけ表示 →</a>
      </div>

      {/* 検索 */}
      <div style={{ padding: '18px 32px', borderBottom: '1px solid var(--color-line)', background: 'var(--color-paper)', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
        <div className="search" style={{ maxWidth: 380 }}>
          <span className="ico">⌕</span>
          <input placeholder="部品名・品番・仕入先で検索…" />
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--color-ink-mid)', cursor: 'pointer' }}>
          <input type="checkbox" /> 発注が必要なものだけ表示
        </label>
        <label style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--color-ink-mid)', cursor: 'pointer' }}>
          <input type="checkbox" /> 非表示を含める
        </label>
      </div>

      <div className="body-area" style={{ overflow: 'hidden', padding: '20px 32px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderTop: '1px solid var(--color-line)', borderBottom: '2px solid var(--color-line-strong)', background: 'var(--color-paper)' }}>
              <ThS w="6%">並び</ThS>
              <ThS w="26%">部品名</ThS>
              <ThS w="11%" right>原価</ThS>
              <ThS w="11%" right>売価</ThS>
              <ThS w="9%" right>在庫</ThS>
              <ThS w="9%" right>発注点</ThS>
              <ThS w="9%">明細</ThS>
              <ThS w="9%">状態</ThS>
              <ThS w="10%" right>操作</ThS>
            </tr>
          </thead>
          <tbody>
            {PARTS.map((p, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--color-line)', background: i % 2 === 1 ? 'var(--color-paper)' : 'transparent' }}>
                <TdS>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn-ghost btn-sm" style={{ padding: '4px 8px', fontSize: 11 }}>↑</button>
                    <button className="btn-ghost btn-sm" style={{ padding: '4px 8px', fontSize: 11 }}>↓</button>
                  </div>
                </TdS>
                <TdS>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--color-ink)', letterSpacing: '0.02em' }}>{p.name}</div>
                  {p.sku && <div style={{ fontSize: 11.5, color: 'var(--color-ink-light)', marginTop: 3 }}>{p.sku}</div>}
                  <div style={{ fontSize: 11.5, color: 'var(--color-ink-light)', marginTop: 2 }}>仕入先: {p.supplier}</div>
                </TdS>
                <TdS right num>¥{p.cost.toLocaleString('en-US')}</TdS>
                <TdS right num>{p.sale ? `¥${p.sale.toLocaleString('en-US')}` : '—'}</TdS>
                <TdS right num>
                  <strong style={{ fontWeight: 600, fontSize: 14.5 }}>{p.stock}</strong>
                </TdS>
                <TdS right num muted>{p.reorder}</TdS>
                <TdS>
                  {p.detail
                    ? <span style={{ display: 'inline-block', padding: '3px 8px', fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', color: 'var(--color-ink-mid)', border: '1px solid var(--color-line-strong)' }}>出す</span>
                    : <span style={{ display: 'inline-block', padding: '3px 8px', fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', color: 'var(--color-busy)', border: '1px solid var(--color-busy)' }}>間接材料</span>}
                </TdS>
                <TdS>
                  {p.status === 'out' && <PayBadge tone="warn" label="欠品" />}
                  {p.status === 'low' && <PayBadge tone="warn" label="発注" />}
                  {p.status === 'ok'  && <PayBadge tone="go"   label="在庫OK" />}
                </TdS>
                <TdS right>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    <button className="btn-ghost btn-sm" style={{ fontSize: 11 }}>入庫</button>
                    <button className="btn-ghost btn-sm" style={{ fontSize: 11 }}>編集</button>
                  </div>
                </TdS>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

// ============================================================
// 7. 設定 (店舗情報)
// ============================================================
function SettingsScreen() {
  const s = SHOP_INFO;
  return (
    <AppShell active="settings">
      <ScreenHead
        crumbs="システム"
        title="設定"
        gloss="店舗情報・振込先・帳票画像を一元管理。 ここで保存した内容が見積書・請求書に印字されます。"
        actions={<button className="btn">変更を保存</button>}
      />

      <div className="body-area" style={{ overflow: 'hidden', padding: '24px 32px', display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 28 }}>
        {/* 左: フォーム */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <FormSection title="店舗情報">
            <FormField label="店舗名" required value={s.shop_name} />
            <FormField label="住所" value={s.address} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <FormField label="電話番号" value={s.phone} mono />
              <FormField label="インボイス登録番号" value={s.registration_no} mono placeholder="T1234567890123" />
            </div>
          </FormSection>

          <FormSection title="振込先情報" sub="請求書のフッタに表示されます。 すべて未入力の場合は表示されません。">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <FormField label="銀行名" value={s.bank_name} placeholder="例: 千葉銀行" />
              <FormField label="支店名" value={s.branch_name} placeholder="例: 佐倉支店" />
              <FormField label="口座種別" value={s.account_type} select />
              <FormField label="口座番号" value={s.account_number} mono placeholder="1234567" />
            </div>
            <FormField label="口座名義" value={s.account_holder} placeholder="例: ヒイラギジドウシヤセイビコウジヨウ" />
          </FormSection>
        </div>

        {/* 右: アップロード */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <FormSection title="店舗ロゴ" sub="PNG / JPEG / WebP (2MB以内)。 見積書・請求書のヘッダ左上に表示。 長辺 600px 前後を推奨。">
            <UploadSlot caption="logo.png" sub="220 × 80px / 144KB" />
          </FormSection>
          <FormSection title="電子印鑑 (角印)" sub="PNG / JPEG / WebP (1MB以内)。 会社情報の下に表示。 透過PNGなら会社情報と重ねた表示も可能。">
            <UploadSlot caption="hanko.png" sub="300 × 300px / 28KB" stamp />
          </FormSection>
        </div>
      </div>
    </AppShell>
  );
}

function FormSection({ title, sub, children }) {
  return (
    <div style={{ border: '1px solid var(--color-line)', background: 'var(--color-paper)', padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ink)', letterSpacing: '0.04em' }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: 'var(--color-ink-light)', marginTop: 4, letterSpacing: '0.02em', lineHeight: 1.6 }}>{sub}</div>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {children}
      </div>
    </div>
  );
}
function FormField({ label, required, value, placeholder, mono, select }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-mid)', letterSpacing: '0.1em', marginBottom: 6 }}>
        {label}{required && <span style={{ color: 'var(--color-warn)', marginLeft: 4 }}>*</span>}
      </div>
      <div style={{
        padding: '10px 14px',
        border: '1px solid var(--color-line-strong)',
        background: 'var(--color-paper)',
        fontSize: 13.5,
        color: value ? 'var(--color-ink)' : 'var(--color-ink-light)',
        fontFamily: mono ? 'var(--font-num)' : 'var(--font-jp)',
        letterSpacing: mono ? '-0.005em' : '0.03em',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span>{value || placeholder}</span>
        {select && <span style={{ color: 'var(--color-ink-light)' }}>▾</span>}
      </div>
    </div>
  );
}
function UploadSlot({ caption, sub, stamp }) {
  return (
    <div style={{
      border: '1px dashed var(--color-line-strong)',
      background: 'var(--color-cream)',
      padding: stamp ? '24px' : '18px',
      display: 'flex',
      alignItems: 'center',
      gap: 18,
    }}>
      <div style={{
        width: stamp ? 80 : 120,
        height: stamp ? 80 : 50,
        border: stamp ? '2px solid var(--color-warn)' : '1px solid var(--color-line-strong)',
        borderRadius: stamp ? '50%' : 2,
        background: 'var(--color-paper)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: stamp ? 'var(--color-warn)' : 'var(--color-ink-light)',
        fontFamily: 'var(--font-jp)',
        fontSize: stamp ? 14 : 11,
        fontWeight: stamp ? 700 : 500,
        letterSpacing: stamp ? '0.06em' : '0.1em',
      }}>
        {stamp ? '社印' : 'LOGO'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-ink)' }}>{caption}</div>
        <div style={{ fontSize: 11.5, color: 'var(--color-ink-light)', marginTop: 3 }}>{sub}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button className="btn-ghost btn-sm">画像を変更</button>
          <button className="btn-ghost btn-sm">削除</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  PaymentsScreen, SalesScreen, PartsScreen, SettingsScreen,
});
