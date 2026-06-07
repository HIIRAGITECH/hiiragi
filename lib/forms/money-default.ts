// フォーム入力欄の「金額デフォルト値」を文字列で返す。
//
// ねらい:
//   未入力(null/undefined)と「0が登録されている」を区別せず、両方を「空文字 = ハイフン表示」として
//   表示する。クリックして数字を打ったときに 0 と合わさって「10」のような誤入力が出る問題を防ぐ。
//
// 契約:
//   - null / undefined / NaN / 0以下 -> ""（placeholder="—" で空表示する用途）
//   - 正の数 -> String(value)
//
// 保存側との関係:
//   各 server action の pickNumber(...fallback=0) が空文字を 0 に正規化するため、
//   空のまま送信されても NOT NULL DEFAULT 0 のカラムに 0 として書き込まれる。
//   既存 0 のレコードを再保存しても 0 のまま（実害なし）。
export function moneyDefault(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v <= 0) return "";
  return String(v);
}
