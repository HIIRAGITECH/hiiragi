"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  TAX_CATEGORIES,
  WORK_CATEGORIES,
  type TaxCategory,
  type WorkCategory,
} from "@/lib/types";
import {
  countWorkMenuUsage,
  type WorkMenuUsage,
} from "@/lib/work-menus/usage";

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

function pickTaxCategory(formData: FormData): TaxCategory | null {
  const s = pickString(formData, "tax_category");
  if (!s) return null;
  return (TAX_CATEGORIES as readonly string[]).includes(s)
    ? (s as TaxCategory)
    : null;
}

// 旧 pickCategory は廃止（フォームからは送信されなくなった）。
// WORK_CATEGORIES を import 維持しているのは互換派生 (deriveLegacyCategory) のため。
void WORK_CATEGORIES;

// フォームから受け取る生 payload。旧 category / tax_free は派生で計算するため含めない。
type Payload = {
  work_name: string;
  part_name: string | null;
  default_quantity: number;
  default_unit_price: number;
  default_labor_cost: number;
  default_parts_cost: number;
  // 原価（社内管理用、粗利計算に使用）
  labor_cost_price: number;
  parts_cost_price: number;
  memo: string | null;
  tax_category: TaxCategory;
  item_category_id: string;
  // 部品マスターリンク。'マスターから選ぶ' で部品を選んだ場合のみ非 null。
  // 値は呼び出し側で parts_inventory の存在/所有を検証してから書き込む。
  linked_part_id: string | null;
};

function readPayload(formData: FormData): Payload | { error: string } {
  const work_name = pickString(formData, "work_name");
  if (!work_name) return { error: "作業内容は必須です。" };
  const item_category_id = pickString(formData, "item_category_id");
  if (!item_category_id) {
    return { error: "業務カテゴリを選択してください。" };
  }
  const tax_category = pickTaxCategory(formData);
  if (!tax_category) return { error: "税区分を選択してください。" };

  return {
    work_name,
    part_name: pickString(formData, "part_name"),
    default_quantity: pickNumber(formData, "default_quantity", 1),
    default_unit_price: pickNumber(formData, "default_unit_price", 0),
    default_labor_cost: pickNumber(formData, "default_labor_cost", 0),
    default_parts_cost: pickNumber(formData, "default_parts_cost", 0),
    labor_cost_price: pickNumber(formData, "labor_cost_price", 0),
    parts_cost_price: pickNumber(formData, "parts_cost_price", 0),
    memo: pickString(formData, "memo"),
    tax_category,
    item_category_id,
    linked_part_id: pickString(formData, "linked_part_id"),
  };
}

// 部品マスターの存在・所有・アクティブを確認。null を返したら手入力扱いに丸める。
// 削除済み（deleted_at != null）の部品は新規にリンクさせない（既存リンクは別経路で扱う）。
async function resolveLinkedPart(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  linkedPartId: string | null,
): Promise<
  | { ok: true; part: null }
  | { ok: true; part: { id: string; name: string; sale_price: number | null; cost_price: number } }
  | { error: string }
> {
  if (!linkedPartId) return { ok: true, part: null };
  const { data } = await supabase
    .from("parts_inventory")
    .select("id, name, sale_price, cost_price, deleted_at")
    .eq("id", linkedPartId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return { error: "選択した部品が見つかりません。" };
  if (data.deleted_at !== null) {
    return { error: "非表示の部品はリンクできません。" };
  }
  return {
    ok: true,
    part: {
      id: data.id as string,
      name: data.name as string,
      sale_price:
        typeof data.sale_price === "number" ? data.sale_price : null,
      cost_price: Number(data.cost_price ?? 0),
    },
  };
}

// 過渡期: 新フィールド (item_category_id + tax_category) から旧フィールド
// (category + tax_free) を派生する。Step 6-4 / 6-5 で旧フィールドを削除するまで併走。
//
//   tax_category=='shaken_non_tax'                   → category='shaken_tax_free', tax_free=true
//   tax_category=='taxable' && カテゴリ名=='車検整備' → category='shaken',          tax_free=false
//   その他                                           → category='normal',         tax_free=false
function deriveLegacyCategory(
  taxCategory: TaxCategory,
  categoryName: string,
): { category: WorkCategory; tax_free: boolean } {
  if (taxCategory === "shaken_non_tax") {
    return { category: "shaken_tax_free", tax_free: true };
  }
  if (categoryName === "車検整備") {
    return { category: "shaken", tax_free: false };
  }
  return { category: "normal", tax_free: false };
}

// formData の indirect_materials_json をパースする。
// 入力形式: [{ part_id: string, quantity: number }, ...]
// 不正な要素はスキップ、quantity <= 0 もスキップ。
function parseIndirectMaterials(
  formData: FormData,
): { part_id: string; quantity: number }[] {
  const raw = formData.get("indirect_materials_json");
  if (typeof raw !== "string" || raw.trim() === "") return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const out: { part_id: string; quantity: number }[] = [];
    const seen = new Set<string>();
    for (const e of arr) {
      const pid =
        typeof e?.part_id === "string" ? e.part_id.trim() : "";
      const q = Number(e?.quantity);
      if (!pid || seen.has(pid)) continue;
      if (!Number.isFinite(q) || q <= 0) continue;
      seen.add(pid);
      out.push({ part_id: pid, quantity: q });
    }
    return out;
  } catch {
    return [];
  }
}

// 指定 user_id が所有する parts_inventory のうち、引数の id 群と一致するものに絞り込む。
// 戻り値は part_id Set。RLS 経由で確認できる範囲のみ返す。
async function filterOwnedPartIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  partIds: string[],
): Promise<Set<string>> {
  if (partIds.length === 0) return new Set();
  const { data } = await supabase
    .from("parts_inventory")
    .select("id")
    .eq("user_id", userId)
    .in("id", partIds);
  return new Set((data ?? []).map((r) => r.id as string));
}

// menu_item_id に紐づく既存の間接材料を全削除し、entries で全件再挿入する。
// シンプルさを優先し差分計算はしない。RLS は親メニュー所有者で動作。
async function replaceIndirectMaterials(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  menuItemId: string,
  entries: { part_id: string; quantity: number }[],
): Promise<{ error: string } | undefined> {
  // 所有部品のみ受け付ける（他テナント・存在しない id は無視）。
  const owned = await filterOwnedPartIds(
    supabase,
    userId,
    entries.map((e) => e.part_id),
  );
  const valid = entries.filter((e) => owned.has(e.part_id));

  const { error: delErr } = await supabase
    .from("work_menu_indirect_materials")
    .delete()
    .eq("menu_item_id", menuItemId);
  if (delErr) {
    return { error: `間接材料の更新に失敗しました: ${delErr.message}` };
  }

  if (valid.length === 0) return undefined;

  const { error: insErr } = await supabase
    .from("work_menu_indirect_materials")
    .insert(
      valid.map((e) => ({
        menu_item_id: menuItemId,
        part_id: e.part_id,
        quantity: e.quantity,
      })),
    );
  if (insErr) {
    return { error: `間接材料の更新に失敗しました: ${insErr.message}` };
  }
  return undefined;
}

// 業務カテゴリの存在確認 + 名前取得（旧 category 派生用）。
async function resolveCategoryName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  itemCategoryId: string,
): Promise<{ name: string } | { error: string }> {
  const { data } = await supabase
    .from("work_item_categories")
    .select("name, deleted_at")
    .eq("id", itemCategoryId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return { error: "業務カテゴリが見つかりません。" };
  if (data.deleted_at !== null) {
    return { error: "削除済みのカテゴリは選択できません。" };
  }
  return { name: data.name as string };
}

export async function createWorkMenu(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = readPayload(formData);
  if ("error" in result) return result;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  const cat = await resolveCategoryName(supabase, user.id, result.item_category_id);
  if ("error" in cat) return cat;
  const legacy = deriveLegacyCategory(result.tax_category, cat.name);

  // linked_part_id が指定されていれば検証してマスター値を反映（スナップショット）。
  const partRes = await resolveLinkedPart(supabase, user.id, result.linked_part_id);
  if ("error" in partRes) return partRes;
  if (partRes.part) {
    result.part_name = partRes.part.name;
    result.default_parts_cost = partRes.part.sale_price ?? 0;
    result.parts_cost_price = partRes.part.cost_price;
    result.linked_part_id = partRes.part.id;
  } else {
    result.linked_part_id = null;
  }

  // display_order は既存最大値 + 1（同 user_id 内）
  const { data: maxRow } = await supabase
    .from("work_menu_items")
    .select("display_order")
    .eq("user_id", user.id)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder =
    typeof maxRow?.display_order === "number" ? maxRow.display_order + 1 : 0;

  // 1) work_menu_items を挿入し id を取得
  const { data: inserted, error } = await supabase
    .from("work_menu_items")
    .insert({
      ...result,
      category: legacy.category,
      tax_free: legacy.tax_free,
      display_order: nextOrder,
      user_id: user.id,
    })
    .select("id")
    .single();
  if (error || !inserted) {
    return { error: `登録に失敗しました: ${error?.message ?? "unknown"}` };
  }

  // 2) 間接材料リストがあれば紐付け（Step 5）
  const indirect = parseIndirectMaterials(formData);
  if (indirect.length > 0) {
    const r = await replaceIndirectMaterials(
      supabase,
      user.id,
      inserted.id as string,
      indirect,
    );
    if (r && "error" in r) return r;
  }

  revalidatePath("/dashboard/work-menus");
  redirect("/dashboard/work-menus");
}

export async function updateWorkMenu(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = readPayload(formData);
  if ("error" in result) return result;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  const cat = await resolveCategoryName(supabase, user.id, result.item_category_id);
  if ("error" in cat) return cat;
  const legacy = deriveLegacyCategory(result.tax_category, cat.name);

  // 編集時もマスター選択なら最新値で上書き、手入力なら linked_part_id を null に戻す。
  const partRes = await resolveLinkedPart(supabase, user.id, result.linked_part_id);
  if ("error" in partRes) return partRes;
  if (partRes.part) {
    result.part_name = partRes.part.name;
    result.default_parts_cost = partRes.part.sale_price ?? 0;
    result.parts_cost_price = partRes.part.cost_price;
    result.linked_part_id = partRes.part.id;
  } else {
    result.linked_part_id = null;
  }

  const { error } = await supabase
    .from("work_menu_items")
    .update({
      ...result,
      category: legacy.category,
      tax_free: legacy.tax_free,
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: `更新に失敗しました: ${error.message}` };

  // 間接材料は毎回 delete + insert で差し替える（Step 5、シンプルさ優先）。
  const indirect = parseIndirectMaterials(formData);
  const r = await replaceIndirectMaterials(supabase, user.id, id, indirect);
  if (r && "error" in r) return r;

  revalidatePath("/dashboard/work-menus");
  redirect("/dashboard/work-menus");
}

// 旧 deleteWorkMenu(FormData) は廃止。新 API は明示的な mode を取る。
//   - 'soft': deleted_at = now() で非表示化（過去明細との紐付け維持、復元可）
//   - 'hard': 物理削除。work_menu_set_items の参照行を先に削除して FK 制約を回避する。
//             セット側の position は再採番せず、UI 表示時に並び順は維持される。
export type DeleteWorkMenuMode = "soft" | "hard";
export type DeleteWorkMenuResult = { error: string } | { success: true };

export async function deleteWorkMenu(
  id: string,
  mode: DeleteWorkMenuMode,
): Promise<DeleteWorkMenuResult> {
  if (!id) return { error: "ID が不正です。" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  if (mode === "soft") {
    const { error } = await supabase
      .from("work_menu_items")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) return { error: `非表示化に失敗しました: ${error.message}` };
    revalidatePath("/dashboard/work-menus");
    revalidatePath("/dashboard/work-menu-sets");
    return { success: true };
  }

  // hard: セット参照を先に削除してから本体を削除する。
  // RLS により他人のセット行は触れない（owner_delete ポリシー）。
  const { error: linkErr } = await supabase
    .from("work_menu_set_items")
    .delete()
    .eq("menu_item_id", id);
  if (linkErr) {
    return { error: `セット参照の削除に失敗しました: ${linkErr.message}` };
  }
  const { error } = await supabase
    .from("work_menu_items")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: `削除に失敗しました: ${error.message}` };

  revalidatePath("/dashboard/work-menus");
  revalidatePath("/dashboard/work-menu-sets");
  return { success: true };
}

// 使用回数の取得（クライアントから呼び出して警告ダイアログに使う）。
export async function getWorkMenuUsageAction(
  id: string,
): Promise<{ error: string } | { success: true; usage: WorkMenuUsage }> {
  if (!id) return { error: "ID が不正です。" };
  try {
    const usage = await countWorkMenuUsage(id);
    return { success: true, usage };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// 非表示メニューを復元する。
export async function restoreWorkMenu(
  id: string,
): Promise<{ error: string } | { success: true }> {
  if (!id) return { error: "ID が不正です。" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  const { error } = await supabase
    .from("work_menu_items")
    .update({ deleted_at: null })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: `復元に失敗しました: ${error.message}` };
  revalidatePath("/dashboard/work-menus");
  return { success: true };
}

export async function duplicateWorkMenu(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: src } = await supabase
    .from("work_menu_items")
    .select(
      "work_name, part_name, category, default_quantity, default_unit_price, default_labor_cost, default_parts_cost, labor_cost_price, parts_cost_price, tax_free, memo, tax_category, item_category_id, linked_part_id",
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!src) return;

  const { data: maxRow } = await supabase
    .from("work_menu_items")
    .select("display_order")
    .eq("user_id", user.id)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder =
    typeof maxRow?.display_order === "number" ? maxRow.display_order + 1 : 0;

  const { data: inserted } = await supabase
    .from("work_menu_items")
    .insert({
      ...src,
      work_name: `${src.work_name}（コピー）`,
      display_order: nextOrder,
      user_id: user.id,
    })
    .select("id")
    .single();

  // 間接材料も複製（コピー元メニューに紐づくエントリをそのまま新メニューに付け直す）。
  if (inserted?.id) {
    const { data: srcIndirect } = await supabase
      .from("work_menu_indirect_materials")
      .select("part_id, quantity")
      .eq("menu_item_id", id);
    if (srcIndirect && srcIndirect.length > 0) {
      await supabase.from("work_menu_indirect_materials").insert(
        srcIndirect.map((e) => ({
          menu_item_id: inserted.id as string,
          part_id: e.part_id as string,
          quantity: Number(e.quantity ?? 0),
        })),
      );
    }
  }

  revalidatePath("/dashboard/work-menus");
  if (inserted?.id) {
    redirect(`/dashboard/work-menus/${inserted.id}/edit`);
  }
}

// 受注明細フォームの ☆ ボタンから呼ばれる: 1 行を作業メニューマスターに登録する。
// 補足（note）はマスター対象外なので渡さない。redirect しない、戻り値で id を返す。
//
// 業務カテゴリ統合後: 呼び出し側が tax_category と item_category_id を渡し、
// このアクション内で旧 category / tax_free を派生して同期書き込みする。
export type RegisterMenuPayload = {
  work_name: string;
  part_name: string | null;
  default_quantity: number;
  default_unit_price: number;
  default_labor_cost: number;
  default_parts_cost: number;
  // 原価（社内管理用）。明細行から登録するときに引き継ぐ。
  labor_cost_price: number;
  parts_cost_price: number;
  tax_category: TaxCategory;
  item_category_id: string;
  // 明細行が linked_part_id を持っていればマスター登録時にも引き継ぐ。
  linked_part_id?: string | null;
};

export type RegisterMenuResult =
  | { error: string }
  | { success: true; id: string };

export async function registerOrderItemAsMenu(
  payload: RegisterMenuPayload,
): Promise<RegisterMenuResult> {
  if (!payload.work_name || payload.work_name.trim() === "") {
    return { error: "作業内容が空のため登録できません。" };
  }
  if (!(TAX_CATEGORIES as readonly string[]).includes(payload.tax_category)) {
    return { error: "税区分が不正です。" };
  }
  if (!payload.item_category_id) {
    return { error: "業務カテゴリが指定されていません。" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  const cat = await resolveCategoryName(
    supabase,
    user.id,
    payload.item_category_id,
  );
  if ("error" in cat) return cat;
  const legacy = deriveLegacyCategory(payload.tax_category, cat.name);

  const { data: maxRow } = await supabase
    .from("work_menu_items")
    .select("display_order")
    .eq("user_id", user.id)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder =
    typeof maxRow?.display_order === "number" ? maxRow.display_order + 1 : 0;

  // linked_part_id が指定されていれば検証。手入力 (null) はそのまま。
  // 削除済み・他テナント所有 → エラー扱いではなく null に丸める（明細経由の登録なので
  // 「リンクが取れなくてもマスター登録は完了させたい」運用を優先）。
  let linked_part_id: string | null = null;
  if (payload.linked_part_id) {
    const partRes = await resolveLinkedPart(
      supabase,
      user.id,
      payload.linked_part_id,
    );
    if ("ok" in partRes && partRes.part) {
      linked_part_id = partRes.part.id;
    }
  }

  const { data: inserted, error } = await supabase
    .from("work_menu_items")
    .insert({
      work_name: payload.work_name.trim(),
      part_name: payload.part_name,
      default_quantity: payload.default_quantity,
      default_unit_price: payload.default_unit_price,
      default_labor_cost: payload.default_labor_cost,
      default_parts_cost: payload.default_parts_cost,
      labor_cost_price: payload.labor_cost_price,
      parts_cost_price: payload.parts_cost_price,
      linked_part_id,
      // 新フィールド
      tax_category: payload.tax_category,
      item_category_id: payload.item_category_id,
      // 旧フィールド（互換）
      category: legacy.category,
      tax_free: legacy.tax_free,
      display_order: nextOrder,
      user_id: user.id,
    })
    .select("id")
    .single();
  if (error || !inserted) {
    return { error: `登録に失敗しました: ${error?.message ?? "unknown"}` };
  }

  revalidatePath("/dashboard/work-menus");
  return { success: true, id: inserted.id };
}

// ↑↓ ボタン用: 隣接行と display_order を入れ替える。
export async function moveWorkMenu(
  id: string,
  direction: "up" | "down",
): Promise<{ error: string } | undefined> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "認証エラー: 再度ログインしてください。" };

  const { data: cur } = await supabase
    .from("work_menu_items")
    .select("id, display_order")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!cur) return { error: "対象が見つかりません。" };

  const op = direction === "up" ? "lt" : "gt";
  const { data: neighbor } = await supabase
    .from("work_menu_items")
    .select("id, display_order")
    .eq("user_id", user.id)
    .filter("display_order", op, cur.display_order)
    .order("display_order", { ascending: direction !== "up" })
    .limit(1)
    .maybeSingle();
  if (!neighbor) return; // 端なので無視

  // 2 行の display_order を入れ替え（衝突回避のため一時値を使う）
  const TEMP = -999_999_999;
  await supabase
    .from("work_menu_items")
    .update({ display_order: TEMP })
    .eq("id", cur.id)
    .eq("user_id", user.id);
  await supabase
    .from("work_menu_items")
    .update({ display_order: cur.display_order })
    .eq("id", neighbor.id)
    .eq("user_id", user.id);
  await supabase
    .from("work_menu_items")
    .update({ display_order: neighbor.display_order })
    .eq("id", cur.id)
    .eq("user_id", user.id);

  revalidatePath("/dashboard/work-menus");
  return undefined;
}
