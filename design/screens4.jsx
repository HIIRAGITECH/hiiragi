// screens4.jsx — 残り画面 (新規受注 / 作業メニュー / 作業セット / 見積書 / 請求書 / ログイン)

// ===== サンプルデータ ===========================================
const WORK_MENUS = [
  { name: 'フロントフォーク OH (BFF)',        part: 'SHOWA SS-19 オイル',  category: '整備', labor: 38000, parts: 8400,  linked: true,  taxNon: false },
  { name: 'リアショック OH',                  part: 'KYB シールキット',     category: '整備', labor: 32000, parts: 7800,  linked: true,  taxNon: false },
  { name: '12ヶ月点検 一式',                   part: null,                  category: '車検整備', labor: 28000, parts: 0,    linked: false, taxNon: false },
  { name: '車検 (継続検査) 法定費用',          part: null,                  category: '車検法定費用', labor: 0, parts: 27840, linked: false, taxNon: true  },
  { name: 'ブレーキフルード交換',              part: 'ホンダ DOT5.1',       category: '整備', labor: 6000,  parts: 2400,  linked: true,  taxNon: false },
  { name: 'タイヤ交換 (前後)',                part: 'ピレリ ANGEL ST',     category: 'タイヤ', labor: 8000, parts: 56000, linked: false, taxNon: false },
];

const WORK_SETS = [
  { name: 'フォーク OH + 試乗セット', desc: 'SHOWA系フォーク常連メニュー', items: ['フロントフォーク OH (BFF)', 'シール交換 (左右)', 'セッティング調整', '試乗 + 微調整'], price: 64000 },
  { name: '車検 一式 (継続検査)',     desc: '12ヶ月点検 + 法定費用 + 預かり', items: ['12ヶ月点検 一式', '車検 (継続検査) 法定費用', '預かり料 (1日)'], price: 95840 },
  { name: 'タイヤ交換 一式',          desc: '前後タイヤ + バランス取り',   items: ['タイヤ交換 (前後)', 'バランス取り', 'バルブ交換'], price: 70000 },
];

// ============================================================
// 1. 新規受注作成
// ============================================================
function NewOrderScreen() {
  return (
    <AppShell active="orders">
      <div style={{ padding: '16px 32px 0', flexShrink: 0 }}>
        <a style={{ fontSize: 12.5, color: 'var(--color-ink-mid)', letterSpacing: '0.06em' }}>← 受注一覧に戻る</a>
      </div>
      <ScreenHead
        crumbs="受注管理 ／ 新規作成"
        title="新規受注を作成"
        gloss="顧客と車両を選択して受注を開始します。 明細は次の画面で編集できます。"
      />

      <div className="body-area" style={{ overflow: 'hidden', padding: '24px 32px', display: 'grid', gridTemplateColumns: '1fr 360px', gap: 32 }}>
        {/* 左: フォーム */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 720 }}>
          <FormSection title="顧客・車両">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <FormField label="顧客" required value="山田 太郎 (CUS-00128)" select />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-mid)', letterSpacing: '0.1em', marginBottom: 6 }}>車両</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1, padding: '10px 14px', border: '1px solid var(--color-line-strong)', background: 'var(--color-paper)', fontSize: 13.5, color: 'var(--color-ink)', letterSpacing: '0.03em', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>HONDA CBR1000RR-R (湘南 し 11-04)</span>
                    <span style={{ color: 'var(--color-ink-light)' }}>▾</span>
                  </div>
                  <button className="btn-ghost btn-sm" style={{ whiteSpace: 'nowrap' }}>＋ 新規</button>
                </div>
              </div>
            </div>
            <FormField label="受付日" required value="2026-05-27" mono />
          </FormSection>

          <FormSection title="入荷時メモ" sub="受注一覧画面で確認するための社内向けメモ。 見積書・請求書には印字されません。">
            <div style={{
              padding: '12px 14px',
              border: '1px solid var(--color-line-strong)',
              background: 'var(--color-paper)',
              minHeight: 110,
              fontSize: 13,
              color: 'var(--color-ink-soft)',
              letterSpacing: '0.03em',
              lineHeight: 1.7,
            }}>
              SHOWA フロントフォーク OH。<br/>
              フリクション軽減希望、初期作動性重視。<br/>
              オイル番手は次回ご相談。
            </div>
          </FormSection>

          {/* アクション */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 8 }}>
            <button className="btn-ghost">キャンセル</button>
            <button className="btn">保存して明細編集へ進む</button>
          </div>
        </div>

        {/* 右: ヒント */}
        <div>
          <SideCard title="次のステップ">
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--color-ink-soft)', letterSpacing: '0.03em', lineHeight: 1.85 }}>
              <li>顧客と車両を選択</li>
              <li>受付日を確認 (本日が初期値)</li>
              <li>「保存して明細編集へ」を押すと管理番号が自動採番されます</li>
              <li>受注詳細画面で作業内容・部品を追加し、見積書を発行</li>
            </ol>
          </SideCard>
          <div style={{ height: 18 }}></div>
          <SideCard title="本日の自動採番">
            <div style={{ fontFamily: 'var(--font-num)', fontSize: 22, fontWeight: 500, color: 'var(--color-accent)', letterSpacing: '0.02em' }}>ORD-2026-0153</div>
            <div style={{ fontSize: 12, color: 'var(--color-ink-mid)', marginTop: 4 }}>保存時にこの番号が割り当てられます。</div>
          </SideCard>
        </div>
      </div>
    </AppShell>
  );
}

// ============================================================
// 2. 作業メニュー一覧
// ============================================================
function WorkMenusScreen() {
  return (
    <AppShell active="work-menus">
      <ScreenHead
        crumbs="工房"
        title="作業メニュー"
        gloss={`登録件数 ${WORK_MENUS.length} 件。 受注詳細の「メニューから追加」で参照されるマスタです。`}
        actions={<>
          <button className="btn-ghost btn-sm">CSV書き出し</button>
          <button className="btn">＋ 新規登録</button>
        </>}
      />
      <div style={{ padding: '18px 32px', borderBottom: '1px solid var(--color-line)', background: 'var(--color-paper)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, flexWrap: 'wrap' }}>
        <div className="search" style={{ maxWidth: 320, minWidth: 240 }}>
          <span className="ico">⌕</span>
          <input placeholder="作業内容・部品名で検索…" />
        </div>
        <span className="chip active">すべて <span className="ct">{WORK_MENUS.length}</span></span>
        <span className="chip">整備 <span className="ct">5</span></span>
        <span className="chip">車検整備 <span className="ct">1</span></span>
        <span className="chip">車検法定費用 <span className="ct">1</span></span>
        <span className="chip">タイヤ <span className="ct">1</span></span>
        <span className="chip">預かり・出張費 <span className="ct">1</span></span>
        <label style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--color-ink-mid)' }}>
          <input type="checkbox" /> 非表示を含める
        </label>
      </div>
      <div className="body-area" style={{ overflow: 'hidden', padding: '20px 32px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderTop: '1px solid var(--color-line)', borderBottom: '2px solid var(--color-line-strong)', background: 'var(--color-paper)' }}>
              <ThS w="6%">並び</ThS>
              <ThS w="30%">作業内容</ThS>
              <ThS w="20%">部品名</ThS>
              <ThS w="14%">カテゴリ</ThS>
              <ThS w="9%" right>工賃</ThS>
              <ThS w="9%" right>部品代</ThS>
              <ThS w="12%" right>合計・操作</ThS>
            </tr>
          </thead>
          <tbody>
            {WORK_MENUS.map((m, i) => {
              const total = m.labor + m.parts;
              return (
                <tr key={i} style={{ borderBottom: '1px solid var(--color-line)', background: i % 2 === 1 ? 'var(--color-paper)' : 'transparent' }}>
                  <TdS>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn-ghost btn-sm" style={{ padding: '4px 8px', fontSize: 11 }}>↑</button>
                      <button className="btn-ghost btn-sm" style={{ padding: '4px 8px', fontSize: 11 }}>↓</button>
                    </div>
                  </TdS>
                  <TdS><strong style={{ fontWeight: 600, color: 'var(--color-ink)' }}>{m.name}</strong></TdS>
                  <TdS muted>
                    {m.part || '—'}
                    {m.linked && <span style={{ display: 'inline-block', marginLeft: 8, padding: '2px 6px', fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', color: 'var(--color-accent)', border: '1px solid var(--color-accent)' }}>在庫連動</span>}
                  </TdS>
                  <TdS>
                    <span style={{ display: 'inline-block', padding: '3px 8px', fontSize: 11.5, fontWeight: 500, color: 'var(--color-ink-mid)', background: 'var(--color-cream)' }}>{m.category}</span>
                    {m.taxNon && <span style={{ marginLeft: 6, padding: '2px 6px', fontSize: 10, fontWeight: 600, color: 'var(--color-warn)', border: '1px solid var(--color-warn)' }}>非課税</span>}
                  </TdS>
                  <TdS right num>{m.labor > 0 ? `¥${m.labor.toLocaleString('en-US')}` : '—'}</TdS>
                  <TdS right num>{m.parts > 0 ? `¥${m.parts.toLocaleString('en-US')}` : '—'}</TdS>
                  <TdS right>
                    <div style={{ fontFamily: 'var(--font-num)', fontSize: 14.5, fontWeight: 600, color: 'var(--color-ink)' }}>¥{total.toLocaleString('en-US')}</div>
                    <div style={{ marginTop: 6, display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <button className="btn-ghost btn-sm" style={{ fontSize: 11 }}>編集</button>
                      <button className="btn-ghost btn-sm" style={{ fontSize: 11 }}>複製</button>
                    </div>
                  </TdS>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

// ============================================================
// 3. 作業セット一覧
// ============================================================
function WorkSetsScreen() {
  return (
    <AppShell active="work-sets">
      <ScreenHead
        crumbs="工房"
        title="作業セット"
        gloss="よく使う作業の組み合わせを登録しておくと、受注明細にまとめて追加できます。"
        actions={<button className="btn">＋ 新規登録</button>}
      />
      <div className="body-area" style={{ overflow: 'hidden', padding: '24px 32px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, alignContent: 'start' }}>
        {WORK_SETS.map((s, i) => (
          <div key={i} style={{ border: '1px solid var(--color-line)', background: 'var(--color-paper)', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--color-accent)', fontWeight: 600, letterSpacing: '0.16em', marginBottom: 6 }}>セット {String(i + 1).padStart(2, '0')}</div>
              <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--color-ink)', letterSpacing: '0.03em' }}>{s.name}</div>
              <div style={{ fontSize: 12, color: 'var(--color-ink-mid)', marginTop: 4, letterSpacing: '0.04em' }}>{s.desc}</div>
            </div>
            <div className="hair"></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {s.items.map((it, j) => (
                <div key={j} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 12.5, color: 'var(--color-ink-soft)', letterSpacing: '0.03em' }}>
                  <span style={{ fontFamily: 'var(--font-num)', color: 'var(--color-ink-light)', fontSize: 10.5, minWidth: 14 }}>{String(j + 1).padStart(2, '0')}</span>
                  <span>{it}</span>
                </div>
              ))}
            </div>
            <div className="hair"></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 11.5, color: 'var(--color-ink-light)', letterSpacing: '0.1em' }}>合計目安</span>
              <span className="num-big" style={{ fontSize: 22, color: 'var(--color-ink)' }}>¥{s.price.toLocaleString('en-US')}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <button className="btn-ghost btn-sm" style={{ flex: 1 }}>編集</button>
              <button className="btn-ghost btn-sm" style={{ flex: 1 }}>複製</button>
              <button className="btn-ghost btn-sm">削除</button>
            </div>
          </div>
        ))}
        {/* 追加カード */}
        <div style={{ border: '1px dashed var(--color-line-strong)', background: 'transparent', padding: '20px 22px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 240, color: 'var(--color-ink-light)' }}>
          <span style={{ fontSize: 28, fontWeight: 300, color: 'var(--color-ink-light)' }}>＋</span>
          <span style={{ fontSize: 13, fontWeight: 500, letterSpacing: '0.06em' }}>新しいセットを登録</span>
        </div>
      </div>
    </AppShell>
  );
}

// ============================================================
// 4. 見積書プレビュー  (A4)
// ============================================================
function EstimatePreview() { return PrintablePreview('estimate'); }
function InvoicePreview()  { return PrintablePreview('invoice'); }

function PrintablePreview(type) {
  const isInvoice = type === 'invoice';
  const o = ORDER_DETAIL;
  const items = o.items;
  const subtotal = items.reduce((s, i) => s + i.sub, 0);
  const tax = Math.floor(subtotal * 0.10);
  const total = subtotal + tax;
  const title = isInvoice ? '請求書' : '見積書';
  return (
    <AppShell active="orders">
      <ScreenHead
        crumbs={`受注一覧 ／ ${o.id} ／ ${title}プレビュー`}
        title={`${title}プレビュー`}
        gloss={`${o.customer.name} 様 ／ ${o.vehicle.maker} ${o.vehicle.model} ／ 発行日 2026/05/27`}
        actions={<>
          <button className="btn-ghost btn-sm">戻る</button>
          <button className="btn-ghost btn-sm">PDFをダウンロード</button>
          <button className="btn">印刷</button>
        </>}
      />
      <div className="body-area" style={{ overflow: 'hidden', padding: '20px 32px', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', background: '#e2dfd7' }}>
        {/* A4 用紙 */}
        <div style={{
          width: 700,
          background: '#fff',
          color: '#000',
          padding: '26px 32px',
          fontFamily: '"IBM Plex Sans", "Noto Sans JP", "Yu Gothic", sans-serif',
          fontSize: 11.5,
          boxShadow: '0 12px 32px -8px rgba(0,0,0,0.25)',
        }}>
          <h1 style={{ textAlign: 'center', fontSize: 20, fontWeight: 700, letterSpacing: '0.5em', margin: '0 0 18px', textIndent: '0.5em' }}>{title}</h1>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 16 }}>
            <div>
              <div style={{ display: 'inline-block', padding: '4px 14px', borderBottom: '1px solid #000', fontSize: 16, fontWeight: 500 }}>{o.customer.name}</div>
              <span style={{ marginLeft: 6, fontSize: 13 }}>様</span>
              <div style={{ fontSize: 10.5, marginTop: 6 }}>〒251-0037</div>
              <div style={{ fontSize: 10.5 }}>{o.customer.address}</div>
              <div style={{ fontSize: 10.5 }}>TEL: {o.customer.phone}</div>
              <p style={{ marginTop: 18, fontSize: 10.5, color: '#444' }}>
                {isInvoice ? '下記の通りご請求申し上げます。' : '下記の通りお見積申し上げます。'}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ display: 'inline-block', textAlign: 'left', marginBottom: 10 }}>
                <PDRow label="管理No." value={o.id} mono />
                <PDRow label="発行日"  value="2026/05/27" />
                <PDRow label="受付日"  value={o.date} />
              </div>
              <div style={{ borderTop: '1px solid #000', paddingTop: 8, fontSize: 10.5, textAlign: 'left', display: 'inline-block' }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{SHOP_INFO.shop_name}</div>
                <div>{SHOP_INFO.address}</div>
                <div>TEL: {SHOP_INFO.phone}</div>
                <div>登録番号: {SHOP_INFO.registration_no}</div>
                <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{ width: 56, height: 56, borderRadius: '50%', border: '2px solid #b1503e', color: '#b1503e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em' }}>社印</div>
                </div>
              </div>
            </div>
          </div>

          {/* 御見積金額 */}
          <p style={{ margin: '8px 0 4px', fontSize: 13.5, fontWeight: 700 }}>
            {isInvoice ? 'ご請求金額' : '御見積金額'}: ¥{total.toLocaleString('en-US')}
          </p>

          {/* 車両情報 */}
          <div style={{ border: '1px solid #777', padding: '8px 12px', marginTop: 10, marginBottom: 18, fontSize: 10.5 }}>
            <div style={{ fontSize: 9.5, letterSpacing: '0.16em', color: '#555', fontWeight: 600, marginBottom: 4 }}>車両情報</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              <PDRow label="ナンバー" value={o.vehicle.plate} />
              <PDRow label="メーカー / 車種" value={`${o.vehicle.maker} / ${o.vehicle.model}`} />
              <PDRow label="年式" value={`${o.vehicle.year}年`} />
              <PDRow label="車台番号" value={o.vehicle.vin} />
            </div>
          </div>

          {/* 明細 */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 11, borderBottom: '1.5px solid #000', paddingBottom: 2, marginBottom: 4 }}>【整備】</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10.5 }}>
              <thead>
                <tr style={{ borderBottom: '1.5px solid #000' }}>
                  <th style={{ padding: '4px 6px', textAlign: 'left',  fontWeight: 500, fontSize: 9.5, width: '52%' }}>品名</th>
                  <th style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 500, fontSize: 9.5, width: '9%' }}>数量</th>
                  <th style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 500, fontSize: 9.5, width: '13%' }}>工賃</th>
                  <th style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 500, fontSize: 9.5, width: '13%' }}>部品代</th>
                  <th style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 500, fontSize: 9.5, width: '13%' }}>小計</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #999' }}>
                    <td style={{ padding: '3px 6px' }}>{it.name}</td>
                    <td style={{ padding: '3px 6px', textAlign: 'right' }}>{it.qty}</td>
                    <td style={{ padding: '3px 6px', textAlign: 'right' }}>{it.cat === '整備' ? `¥${it.unit.toLocaleString('en-US')}` : '—'}</td>
                    <td style={{ padding: '3px 6px', textAlign: 'right' }}>{it.cat === '部品' ? `¥${it.unit.toLocaleString('en-US')}` : '—'}</td>
                    <td style={{ padding: '3px 6px', textAlign: 'right' }}>¥{it.sub.toLocaleString('en-US')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 合計 */}
          <div style={{ marginLeft: 'auto', width: 280, fontSize: 11 }}>
            <PDTotal label="課税対象額"   value={`¥${subtotal.toLocaleString('en-US')}`} divider />
            <PDTotal label="消費税 (10%)" value={`¥${tax.toLocaleString('en-US')}`} />
            <PDTotal label="合計"         value={`¥${total.toLocaleString('en-US')}`} emphasize />
          </div>

          {isInvoice && (
            <div style={{ marginTop: 18, border: '1px solid #777', padding: '8px 12px', fontSize: 10.5 }}>
              <div style={{ fontSize: 9.5, letterSpacing: '0.16em', color: '#555', fontWeight: 600, marginBottom: 4 }}>お振込先</div>
              <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: '2px 12px' }}>
                <span style={{ color: '#555' }}>銀行・支店</span><span>{SHOP_INFO.bank_name} {SHOP_INFO.branch_name}</span>
                <span style={{ color: '#555' }}>種別 / 番号</span><span style={{ fontFamily: 'IBM Plex Sans, monospace' }}>{SHOP_INFO.account_type} {SHOP_INFO.account_number}</span>
                <span style={{ color: '#555' }}>名義</span><span>{SHOP_INFO.account_holder}</span>
              </div>
            </div>
          )}
          {isInvoice && (
            <p style={{ marginTop: 14, fontSize: 11 }}>お振込期限: <strong>2026年6月24日</strong></p>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function PDRow({ label, value, mono }) {
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 10.5, alignItems: 'baseline' }}>
      <span style={{ color: '#555', minWidth: 70 }}>{label}</span>
      <span style={{ fontFamily: mono ? 'IBM Plex Sans, monospace' : 'inherit' }}>{value}</span>
    </div>
  );
}
function PDTotal({ label, value, emphasize, divider }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', padding: '4px 4px',
      borderTop: divider ? '1px solid #000' : 'none',
      borderTopWidth: emphasize ? '2px' : undefined,
      borderBottom: emphasize ? '2px solid #000' : 'none',
      fontWeight: emphasize ? 700 : 400,
      fontSize: emphasize ? 14 : 11,
    }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

// ============================================================
// 5. ログイン
// ============================================================
function LoginScreen() {
  return (
    <div className="wos-art" style={{ flexDirection: 'row', background: 'var(--color-ink)' }}>
      {/* 左: ブランドパネル (暗色) */}
      <div style={{ flex: '1.1 1 0', background: 'var(--color-ink)', color: 'var(--color-on-ink-fg)', padding: '60px 64px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-jp)', fontWeight: 700, fontSize: 22, letterSpacing: '0.22em' }}>HIIRAGI <em style={{ fontStyle: 'normal', color: 'var(--color-on-ink-accent)', fontWeight: 500 }}>TECH</em></div>
          <div style={{ fontSize: 12.5, letterSpacing: '0.18em', color: 'var(--color-on-ink-muted)', marginTop: 6 }}>工房管理システム</div>
        </div>
        <div style={{ width: 36, height: 2, background: 'var(--color-on-ink-accent)' }}></div>
        <div style={{ fontSize: 11.5, color: 'var(--color-on-ink-muted)', letterSpacing: '0.12em' }}>© 2026 HIIRAGI TECH</div>
      </div>

      {/* 右: ログインフォーム */}
      <div style={{ flex: '1 1 0', background: 'var(--color-cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
        <div style={{ width: 380 }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--font-jp)', fontWeight: 600, fontSize: 26, color: 'var(--color-ink)', letterSpacing: '0.04em' }}>ログイン</h2>

          <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <FormField label="メールアドレス" value="suzuki@sakura-susp.jp" mono />
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-mid)', letterSpacing: '0.1em' }}>パスワード</div>
                <a style={{ fontSize: 11.5, color: 'var(--color-accent)', textDecoration: 'underline', textUnderlineOffset: 3 }}>パスワードを忘れた</a>
              </div>
              <div style={{ padding: '10px 14px', border: '1px solid var(--color-line-strong)', background: 'var(--color-paper)', fontSize: 14, color: 'var(--color-ink)', letterSpacing: '0.4em' }}>••••••••••••</div>
            </div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--color-ink-mid)', cursor: 'pointer', marginTop: 4 }}>
              <input type="checkbox" defaultChecked /> ログイン状態を保持する
            </label>
            <button className="btn" style={{ width: '100%', marginTop: 8, padding: '14px 20px', fontSize: 14 }}>ログイン</button>
            <div style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--color-ink-mid)', marginTop: 6 }}>
              アカウントをお持ちでない方は <a style={{ color: 'var(--color-accent)', textDecoration: 'underline', textUnderlineOffset: 3, fontWeight: 500 }}>新規登録</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  NewOrderScreen, WorkMenusScreen, WorkSetsScreen,
  EstimatePreview, InvoicePreview, LoginScreen,
  WORK_MENUS, WORK_SETS,
});
