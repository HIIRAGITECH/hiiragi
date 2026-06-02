import "server-only";

import { createClient } from "@/lib/supabase/server";

// 標準（is_system）業務カテゴリの定義。
// supabase/migrations/20260509120000_add_item_categories.sql のシード仕様
// （整備 / 車検整備 / 車検法定費用, display_order 1,2,3, is_system=true）と一致させること。
const SYSTEM_CATEGORIES: { name: string; display_order: number }[] = [
  { name: "整備", display_order: 1 },
  { name: "車検整備", display_order: 2 },
  { name: "車検法定費用", display_order: 3 },
];

// ログイン済みユーザーに標準業務カテゴリが揃っていることを保証する（恒久対策）。
//
// 背景: 2026-05-09 の add_item_categories マイグレーションは「実行時点で存在した
// ユーザー」にのみ標準カテゴリをバックフィルした。以降サインアップした新規ユーザーは
// カテゴリ0件となり、受注明細フォームでセクションが一つも出ず明細追加が出来なくなる
// 不具合があった。サインアップ時にカテゴリを作る仕組み（trigger / action）は無いため、
// ダッシュボード表示時にここで遅延 seed する。
//
// 設計上の約束:
// - service role は使わない。createClient()（anon + cookie = authenticated）で実行し、
//   RLS の WITH CHECK (user_id = auth.uid()) を通す。これは既存の createWorkItemCategory
//   と同じ権限経路。
// - 冪等: 既に存在する標準カテゴリ名は再作成しない（不足分のみ INSERT）。揃っていれば NOOP。
// - 画面遷移を止めない: 例外・DB エラーはログに残すだけで握りつぶす。
//
// レース条件について:
//   work_item_categories には (user_id, name) の一意制約が無いため ON CONFLICT は使えない。
//   初回ダッシュボード表示は通常 1 リクエストなので二重作成はまず起きないが、
//   ごく稀に「初回ログイン直後に複数タブ同時オープン」で重複する可能性は残る。
//   標準カテゴリは構造変更（マイグレーション）なしで一意制約を足せないため、ここでは
//   許容する（実害は標準カテゴリの重複表示のみ）。
export async function ensureSystemCategories(): Promise<void> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // 自ユーザーの既存 is_system カテゴリ名を取得（RLS により自分の行のみ）。
    const { data: existing, error: selectError } = await supabase
      .from("work_item_categories")
      .select("name")
      .eq("user_id", user.id)
      .eq("is_system", true);
    if (selectError) {
      console.error(
        "[ensureSystemCategories] 既存カテゴリの取得に失敗:",
        selectError.message,
      );
      return;
    }

    const existingNames = new Set((existing ?? []).map((r) => r.name));
    const missing = SYSTEM_CATEGORIES.filter(
      (c) => !existingNames.has(c.name),
    );
    if (missing.length === 0) return; // 既に揃っている → NOOP（既存ユーザーは何も変わらない）

    const rows = missing.map((c) => ({
      user_id: user.id,
      name: c.name,
      display_order: c.display_order,
      is_system: true,
    }));

    const { error: insertError } = await supabase
      .from("work_item_categories")
      .insert(rows);
    if (insertError) {
      console.error(
        "[ensureSystemCategories] 標準カテゴリの作成に失敗:",
        insertError.message,
      );
    }
  } catch (e) {
    // 想定外エラーでもダッシュボード表示は継続させる。
    console.error("[ensureSystemCategories] 予期しないエラー:", e);
  }
}
