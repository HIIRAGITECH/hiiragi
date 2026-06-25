"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { MovementType } from "@/lib/types";

export type FormState = { error: string } | undefined;

function pickString(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}

function pickNumber(formData: FormData, key: string, fallback = 0): number {
  const s = pickString(formData, key);
  if (s === null) return fallback;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

// 売価は任意入力。空のときは null、数値なら ≥0 でなければ null（不正値は記録しない）。
function pickNullableNumber(formData: FormData, key: string): number | null {
  const s = pickString(formData, key);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function pickBool(formData: FormData, key: string): boolean {
  const v = formData.get(key);
  return v === "on" || v === "true" || v === "1";
}

// vehicle_tags はクライアントから JSON.stringify(string[]) で送る。防御的に再正規化する。
function pickStringArray(formData: FormData, key: string): string[] {
  const v = formData.get(key);
  if (typeof v !== "string" || v.trim() === "") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(v);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of parsed) {
    if (typeof x !== "string") continue;
    const t = x.trim();
    if (t === "" || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

// フォーム共通のペイロード（編集時は initial_stock_quantity を読まない）。
// 二階建て化（2026-06-24）: 社内品番(internal_code)と売価(sale_price)は本体から外し、
// 「売り方」＝バリアント側（part_number / list_price）で持つ。本体の旧2列は触らない
// （既存データのフォールバック・ロールバック保険のため残置）。
type PartPayload = {
  name: string;
  external_code: string | null;
  cost_price: number;
  show_in_detail: boolean;
  reorder_point: number;
  supplier: string | null;
  unit: string | null;
  memo: string | null;
};

function readPartPayload(formData: FormData): PartPayload | { error: string } {
  const name = pickString(formData, "name");
  if (!name) return { error: "部品名は必須です。" };
  return {
    name,
    external_code: pickString(formData, "external_code"),
    cost_price: pickNumber(formData, "cost_price", 0),
    show_in_detail: pickBool(formData, "show_in_detail"),
    reorder_point: pickNumber(formData, "reorder_point", 0),
    supplier: pickString(formData, "supplier"),
    unit: pickString(formData, "unit"),
    memo: pickString(formData, "memo"),
  };
}

// 新規作成: 価格カード（VariantEditorFields）も編集画面と同じ card_keys / card_<key>_* で受け取り、
// 本体＋複数バリアントを一括作成する。display_order は一覧の最上部（既存最小 - 1）に採番する。
// 初期在庫があれば stock_movements に 'in' で記録。redirect で一覧へ戻る（従来挙動を維持）。
export async function createPart(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  // ① 本体のバリデーション
  const result = readPartPayload(formData);
  if ("error" in result) return result;

  // ① 価格カードのバリデーション（本体INSERT前に弾く＝検証失敗で親が孤立しないように）
  const desired = parseDesiredCards(formData);
  if ("error" in desired) return desired;
  const singleGeneralErr = checkSingleGeneral(desired);
  if (singleGeneralErr) return singleGeneralErr;

  const initial_stock = pickNumber(formData, "initial_stock_quantity", 0);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  // D: 新規は一覧の一番上に出す。既存最小 - 1 を採番（D&D の reorderParts が後で 0..n-1 に
  //    振り直すまで先頭になる。負値は movePart の一時値と同様に許容）。
  const { data: minRow } = await supabase
    .from("parts_inventory")
    .select("display_order")
    .eq("user_id", user.id)
    .order("display_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  const nextOrder =
    typeof minRow?.display_order === "number" ? minRow.display_order - 1 : 0;

  const { data: inserted, error } = await supabase
    .from("parts_inventory")
    .insert({
      ...result,
      stock_quantity: initial_stock,
      display_order: nextOrder,
      user_id: user.id,
    })
    .select("id")
    .single();
  if (error || !inserted) {
    return { error: `登録に失敗しました: ${error?.message ?? "unknown"}` };
  }

  // 二階建て化: 本体INSERTに続けて価格カード（売り方＝バリアント）を作る。
  // カードがあればカード配列順に複数INSERT。カードが1枚も無いときは「部品は必ず価格を持つ」運用を
  // 守るため、空の汎用バリアント（車種空）を1件だけ作る（UI は seedEmpty で常に1枚出すが防御的に）。
  // 失敗時は本体だけ残るが、編集画面で価格を追加できるため致命傷にはしない（エラーは返す）。
  const cardsToInsert =
    desired.length > 0
      ? desired.map((d, i) => ({
          user_id: user.id,
          part_id: inserted.id,
          part_number: d.part_number,
          list_price: d.list_price,
          markup_rate: d.markup_rate,
          vehicle_tags: d.vehicle_tags,
          display_order: i,
        }))
      : [
          {
            user_id: user.id,
            part_id: inserted.id,
            part_number: null,
            list_price: null,
            markup_rate: null,
            vehicle_tags: [],
            display_order: 0,
          },
        ];
  const { error: variantErr } = await supabase
    .from("parts_inventory_variants")
    .insert(cardsToInsert);
  if (variantErr) {
    return {
      error: `部品は登録しましたが、価格の保存に失敗しました（編集画面から追加してください）: ${variantErr.message}`,
    };
  }

  // 初期在庫があれば履歴を残す（cost_price を unit_cost として記録）。
  if (initial_stock > 0) {
    await supabase.from("stock_movements").insert({
      user_id: user.id,
      part_id: inserted.id,
      movement_type: "in" satisfies MovementType,
      quantity: initial_stock,
      unit_cost: result.cost_price,
      memo: "初期在庫",
    });
  }

  revalidatePath("/dashboard/parts-inventory");
  redirect("/dashboard/parts-inventory");
}

// 更新: 在庫数 (stock_quantity) は触らない（入庫/棚卸で変える運用）。
export async function updatePart(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = readPartPayload(formData);
  if ("error" in result) return result;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  const { error } = await supabase
    .from("parts_inventory")
    .update(result)
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: `更新に失敗しました: ${error.message}` };

  revalidatePath("/dashboard/parts-inventory");
  redirect("/dashboard/parts-inventory");
}

// 1カード（売り方＝バリアント）の希望状態。id があれば既存、無ければ新規。
type DesiredCard = {
  id: string | null;
  part_number: string | null;
  list_price: number | null;
  markup_rate: number | null;
  vehicle_tags: string[];
};

// 編集画面の価格カード（VariantEditorFields）を FormData から読み出す。
//   card_keys: 並んでいるカードのキー配列（JSON）。各カードは card_<key>_* で送られる。
function parseDesiredCards(formData: FormData): DesiredCard[] | { error: string } {
  const keysRaw = formData.get("card_keys");
  let keys: string[] = [];
  if (typeof keysRaw === "string" && keysRaw.trim() !== "") {
    try {
      const parsed = JSON.parse(keysRaw);
      if (Array.isArray(parsed)) {
        keys = parsed.filter((k): k is string => typeof k === "string");
      }
    } catch {
      return { error: "送信データが不正です。画面を再読み込みしてください。" };
    }
  }
  return keys.map((k) => ({
    id: pickString(formData, `card_${k}_id`),
    part_number: pickString(formData, `card_${k}_part_number`),
    list_price: pickNullableNumber(formData, `card_${k}_list_price`),
    markup_rate: pickNullableNumber(formData, `card_${k}_markup_rate`),
    vehicle_tags: pickStringArray(formData, `card_${k}_vehicle_tags`),
  }));
}

// 案A: 「車種空（全車種共通）」カードは 1 部品につき 1 枚まで。新規(createPart)・編集
// (updatePartAndVariants) の両方でこの検証を共有する。違反時はエラーを返し、何も保存しない。
function checkSingleGeneral(desired: DesiredCard[]): { error: string } | null {
  const emptyCount = desired.filter((d) => d.vehicle_tags.length === 0).length;
  if (emptyCount > 1) {
    return {
      error:
        "全車種共通の価格（車種を指定しないカード）は1つだけです。車種を指定するか、既存の共通価格を編集してください。",
    };
  }
  return null;
}

// 編集画面の単一「更新する」: 本体（parts_inventory）と価格カード（parts_inventory_variants）を
// まとめて保存する。本体フォームと価格エディタを同じ <form> に同居させ、その submit で呼ばれる。
//
// 手順: ①本体・価格を両方バリデーション（どちらか不正なら何も保存せずエラー返却）
//       ②本体 update → ③価格カードを DB と突き合わせて 更新/挿入/ソフト削除（display_order=並び順）
// 在庫数 (stock_quantity) は触らない（入庫/棚卸で変える運用）。
//
// 案A: 「車種空（全車種共通）」カードは 1 部品につき 1 枚まで。2枚以上は弾く（本体も保存しない）。
export async function updatePartAndVariants(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  // ① 本体のバリデーション
  const body = readPartPayload(formData);
  if ("error" in body) return body;

  // ① 価格カードのバリデーション
  const desired = parseDesiredCards(formData);
  if ("error" in desired) return desired;
  const singleGeneralErr = checkSingleGeneral(desired);
  if (singleGeneralErr) return singleGeneralErr;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  // 所有確認（本体）。
  const { data: parent } = await supabase
    .from("parts_inventory")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!parent) return { error: "対象の部品が見つかりません。" };

  // ② 本体 update
  const { error: bodyErr } = await supabase
    .from("parts_inventory")
    .update(body)
    .eq("id", id)
    .eq("user_id", user.id);
  if (bodyErr) return { error: `更新に失敗しました: ${bodyErr.message}` };

  // ③ 価格カードの突き合わせ。現在のアクティブなバリアント id 群を取得。
  const { data: existingRows } = await supabase
    .from("parts_inventory_variants")
    .select("id")
    .eq("part_id", id)
    .eq("user_id", user.id)
    .is("deleted_at", null);
  const existingIds = new Set((existingRows ?? []).map((r) => r.id as string));
  const submittedIds = new Set(
    desired
      .map((d) => d.id)
      .filter((vid): vid is string => !!vid && existingIds.has(vid)),
  );

  // 画面から消えた既存カード = ソフト削除。
  const toDelete = [...existingIds].filter((vid) => !submittedIds.has(vid));
  if (toDelete.length > 0) {
    const { error } = await supabase
      .from("parts_inventory_variants")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", toDelete)
      .eq("user_id", user.id);
    if (error) return { error: `価格カードの削除に失敗しました: ${error.message}` };
  }

  // カード並び順で更新/挿入。display_order = 並び位置。
  for (let i = 0; i < desired.length; i++) {
    const d = desired[i];
    const fields = {
      part_number: d.part_number,
      list_price: d.list_price,
      markup_rate: d.markup_rate,
      vehicle_tags: d.vehicle_tags,
      display_order: i,
    };
    if (d.id && existingIds.has(d.id)) {
      const { error } = await supabase
        .from("parts_inventory_variants")
        .update(fields)
        .eq("id", d.id)
        .eq("user_id", user.id)
        .eq("part_id", id);
      if (error) return { error: `価格カードの更新に失敗しました: ${error.message}` };
    } else {
      const { error } = await supabase
        .from("parts_inventory_variants")
        .insert({ ...fields, user_id: user.id, part_id: id });
      if (error) return { error: `価格カードの追加に失敗しました: ${error.message}` };
    }
  }

  revalidatePath("/dashboard/parts-inventory");
  redirect("/dashboard/parts-inventory");
}

// 物理削除はしない（Step 3 で受注との連携が始まるため、過去の出庫履歴が孤立するのを避ける）。
// ソフトデリート → 復元のみを提供する。
export async function softDeletePart(
  id: string,
): Promise<{ error: string } | { success: true }> {
  if (!id) return { error: "ID が不正です。" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  const { error } = await supabase
    .from("parts_inventory")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: `非表示化に失敗しました: ${error.message}` };

  revalidatePath("/dashboard/parts-inventory");
  return { success: true };
}

export async function restorePart(
  id: string,
): Promise<{ error: string } | { success: true }> {
  if (!id) return { error: "ID が不正です。" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  const { error } = await supabase
    .from("parts_inventory")
    .update({ deleted_at: null })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: `復元に失敗しました: ${error.message}` };

  revalidatePath("/dashboard/parts-inventory");
  return { success: true };
}

// 複製: 在庫数は引き継がず 0 から開始（同名 → 「（コピー）」サフィックス）。
// 履歴も複製しない。display_order は末尾。
export async function duplicatePart(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: src } = await supabase
    .from("parts_inventory")
    .select(
      "name, internal_code, external_code, cost_price, sale_price, show_in_detail, reorder_point, supplier, unit, memo",
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!src) return;

  const { data: maxRow } = await supabase
    .from("parts_inventory")
    .select("display_order")
    .eq("user_id", user.id)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder =
    typeof maxRow?.display_order === "number" ? maxRow.display_order + 1 : 0;

  const { data: inserted } = await supabase
    .from("parts_inventory")
    .insert({
      ...src,
      name: `${src.name}（コピー）`,
      stock_quantity: 0,
      display_order: nextOrder,
      user_id: user.id,
    })
    .select("id")
    .single();

  // 二階建て化（2026-06-24）: 売り方（標準＋車種別バリアント）も複製する。
  // これをしないと、複製した部品が売価を持たない（新規部品は本体 sale_price が空のため）。
  if (inserted?.id) {
    const { data: srcVariants } = await supabase
      .from("parts_inventory_variants")
      .select("part_number, list_price, vehicle_tags, markup_rate, maker, note, display_order")
      .eq("part_id", id)
      .eq("user_id", user.id)
      .is("deleted_at", null);
    if (srcVariants && srcVariants.length > 0) {
      await supabase.from("parts_inventory_variants").insert(
        srcVariants.map((v) => ({
          ...v,
          user_id: user.id,
          part_id: inserted.id,
        })),
      );
    }
  }

  revalidatePath("/dashboard/parts-inventory");
  if (inserted?.id) {
    redirect(`/dashboard/parts-inventory/${inserted.id}/edit`);
  }
}

// 並び替え: 隣接行と display_order を入れ替え（フィルタ解除時のみ呼べる UI 想定）。
export async function movePart(
  id: string,
  direction: "up" | "down",
): Promise<{ error: string } | undefined> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  const { data: cur } = await supabase
    .from("parts_inventory")
    .select("id, display_order")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!cur) return { error: "対象が見つかりません。" };

  const op = direction === "up" ? "lt" : "gt";
  const { data: neighbor } = await supabase
    .from("parts_inventory")
    .select("id, display_order")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .filter("display_order", op, cur.display_order)
    .order("display_order", { ascending: direction !== "up" })
    .limit(1)
    .maybeSingle();
  if (!neighbor) return;

  const TEMP = -999_999_999;
  await supabase
    .from("parts_inventory")
    .update({ display_order: TEMP })
    .eq("id", cur.id)
    .eq("user_id", user.id);
  await supabase
    .from("parts_inventory")
    .update({ display_order: cur.display_order })
    .eq("id", neighbor.id)
    .eq("user_id", user.id);
  await supabase
    .from("parts_inventory")
    .update({ display_order: neighbor.display_order })
    .eq("id", cur.id)
    .eq("user_id", user.id);

  revalidatePath("/dashboard/parts-inventory");
  return undefined;
}

// ドラッグ&ドロップ並べ替え: 渡された id 配列の順に display_order を 0..n-1 で振り直す。
// ↑↓ の movePart と同じ display_order に保存する（リロード後も並びが保持される）。
// フィルタ解除・非表示を含めない通常表示でのみ呼ばれる前提（クライアント側で制御）。
export async function reorderParts(
  orderedIds: string[],
): Promise<{ error: string } | { success: true }> {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { success: true };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from("parts_inventory")
      .update({ display_order: i })
      .eq("id", orderedIds[i])
      .eq("user_id", user.id);
    if (error) return { error: `並べ替えに失敗しました: ${error.message}` };
  }

  revalidatePath("/dashboard/parts-inventory");
  return { success: true };
}

// 入庫登録: stock_quantity を加算し、stock_movements に 'in' として記録。
// quantity は 0 より大きい正数のみ受け付ける。
export type StockInPayload = {
  part_id: string;
  quantity: number;
  unit_cost: number | null;
  memo: string | null;
};

export async function registerStockIn(
  payload: StockInPayload,
): Promise<{ error: string } | { success: true }> {
  if (!payload.part_id) return { error: "対象部品が指定されていません。" };
  if (!Number.isFinite(payload.quantity) || payload.quantity <= 0) {
    return { error: "入庫数は 0 より大きい数値で入力してください。" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  const { data: cur } = await supabase
    .from("parts_inventory")
    .select("stock_quantity")
    .eq("id", payload.part_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!cur) return { error: "対象部品が見つかりません。" };

  const nextQty = Number(cur.stock_quantity) + payload.quantity;

  const { error: updErr } = await supabase
    .from("parts_inventory")
    .update({ stock_quantity: nextQty })
    .eq("id", payload.part_id)
    .eq("user_id", user.id);
  if (updErr) return { error: `在庫更新に失敗しました: ${updErr.message}` };

  const { error: movErr } = await supabase.from("stock_movements").insert({
    user_id: user.id,
    part_id: payload.part_id,
    movement_type: "in" satisfies MovementType,
    quantity: payload.quantity,
    unit_cost: payload.unit_cost,
    memo: payload.memo,
  });
  if (movErr) {
    // 履歴記録に失敗した場合、在庫は加算済み。整合性は失われるが
    // 障害ログは Supabase 側に残るので運用で復旧する想定。
    return { error: `履歴記録に失敗しました: ${movErr.message}` };
  }

  revalidatePath("/dashboard/parts-inventory");
  return { success: true };
}

// 棚卸調整: stock_quantity を絶対値で上書きし、差分を 'adjust' で履歴記録。
// new_quantity は ≥0 を許容（0 = 在庫なしに修正、もあり得る）。
export type StockAdjustPayload = {
  part_id: string;
  new_quantity: number;
  memo: string | null;
};

export async function adjustStock(
  payload: StockAdjustPayload,
): Promise<{ error: string } | { success: true; delta: number }> {
  if (!payload.part_id) return { error: "対象部品が指定されていません。" };
  if (!Number.isFinite(payload.new_quantity) || payload.new_quantity < 0) {
    return { error: "実在庫数は 0 以上の数値で入力してください。" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  const { data: cur } = await supabase
    .from("parts_inventory")
    .select("stock_quantity")
    .eq("id", payload.part_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!cur) return { error: "対象部品が見つかりません。" };

  const delta = payload.new_quantity - Number(cur.stock_quantity);

  // 差分 0 のときは何もしないで成功扱い（履歴も増やさない）。
  if (delta === 0) return { success: true, delta: 0 };

  const { error: updErr } = await supabase
    .from("parts_inventory")
    .update({ stock_quantity: payload.new_quantity })
    .eq("id", payload.part_id)
    .eq("user_id", user.id);
  if (updErr) return { error: `在庫更新に失敗しました: ${updErr.message}` };

  const { error: movErr } = await supabase.from("stock_movements").insert({
    user_id: user.id,
    part_id: payload.part_id,
    movement_type: "adjust" satisfies MovementType,
    quantity: delta,
    memo: payload.memo,
  });
  if (movErr) {
    return { error: `履歴記録に失敗しました: ${movErr.message}` };
  }

  revalidatePath("/dashboard/parts-inventory");
  return { success: true, delta };
}

// form action 用の薄いラッパー（削除ボタンから hidden id を受けて呼ぶ）。
export async function softDeletePartFormAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await softDeletePart(id);
}
