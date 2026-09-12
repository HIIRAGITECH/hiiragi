"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// 貼り付け入庫の確定処理。DBへの書き込みは全てここ（commit_paste_stock_in RPC）で1トランザクションで行う。
// 「確定」を押すまで（＝この関数が呼ばれるまで）DBには一切書き込まない。
//
// 更新するのは原価(cost_price)と在庫数(stock_quantity)のみ。定価(list_price)・掛率(markup_rate)には
// 一切書き込まない。入庫は在庫数の加算のみで、既存の在庫RPC（reserve/consume 等）とは独立。

// 1行ぶんの確定内容。クライアント側の照合・確認UIで確定した扱いを、そのまま RPC の p_lines に渡す。
export type CommitLine =
  | {
      action: "existing";
      part_id: string;
      quantity: number;
      // 納品書の単価（実際に支払った単価）。履歴 unit_cost に記録する。空なら null。
      unit_cost: number | null;
      // true かつ unit_cost が非null のときだけ、部品マスターの原価を更新する。
      update_cost: boolean;
    }
  | {
      action: "new";
      name: string;
      external_code: string | null;
      unit: string | null;
      supplier: string | null;
      quantity: number;
      // 納品書の単価。新規部品の原価(cost_price)＝この値（null は 0 として登録）。
      unit_cost: number | null;
    };

export type CommitPayload = {
  delivery_note_no: string | null;
  supplier: string | null;
  note: string | null;
  lines: CommitLine[];
};

export type CommitResult =
  | { error: string }
  | { success: true; created: number; updated: number };

function isValidLine(l: CommitLine): boolean {
  if (!Number.isFinite(l.quantity) || l.quantity <= 0) return false;
  if (l.unit_cost !== null && (!Number.isFinite(l.unit_cost) || l.unit_cost < 0))
    return false;
  if (l.action === "existing") return typeof l.part_id === "string" && !!l.part_id;
  if (l.action === "new") return typeof l.name === "string" && l.name.trim() !== "";
  return false;
}

export async function commitPasteStockIn(
  payload: CommitPayload,
): Promise<CommitResult> {
  const lines = Array.isArray(payload.lines) ? payload.lines : [];
  if (lines.length === 0) {
    return { error: "入庫する行がありません。" };
  }
  // サーバー側でも最終防衛。数量・新規名・part_id の欠落を弾く（不正なら1件も書き込まない）。
  for (const l of lines) {
    if (!isValidLine(l)) {
      return {
        error:
          "確定できない行があります（数量・品名・照合先を確認してください）。",
      };
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  // RPC には JSON をそのまま渡す。RLS/所有確認は SECURITY INVOKER の RPC 内で評価される。
  const { data, error } = await supabase.rpc("commit_paste_stock_in", {
    p_delivery_note_no: payload.delivery_note_no,
    p_supplier: payload.supplier,
    p_note: payload.note,
    p_lines: lines,
  });
  if (error) {
    return { error: `入庫の確定に失敗しました: ${error.message}` };
  }

  const result = (data ?? {}) as {
    created?: number;
    updated?: number;
  };

  revalidatePath("/dashboard/parts-inventory");
  return {
    success: true,
    created: Number(result.created ?? 0),
    updated: Number(result.updated ?? 0),
  };
}

// 二重投入の警告用。同じ納品書番号での既存バッチがあるか調べる（強制ブロックはしない）。
// 見つかったら直近の入庫日時を返す。
export async function lookupDeliveryNote(
  deliveryNoteNo: string,
): Promise<{ exists: boolean; lastAt: string | null }> {
  const no = deliveryNoteNo.trim();
  if (no === "") return { exists: false, lastAt: null };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { exists: false, lastAt: null };

  const { data } = await supabase
    .from("parts_stock_in_batches")
    .select("created_at")
    .eq("user_id", user.id)
    .eq("delivery_note_no", no)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { exists: !!data, lastAt: data?.created_at ?? null };
}
