"use client";

import Link from "next/link";
import {
  useActionState,
  useMemo,
  useState,
  useTransition,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type {
  Customer,
  IndirectMaterialEntry,
  OrderItem,
  PartsInventory,
  PartsInventoryVariant,
  TaxCategory,
  Vehicle,
  WorkItemCategory,
  WorkMenuItem,
  WorkMenuSet,
} from "@/lib/types";
import {
  calculateListPriceTotals,
  calculateProfit,
  calculateTotals,
  rowSubtotal,
} from "@/lib/orders/totals";
import { formatYen } from "@/lib/format";
import { moneyDefault } from "@/lib/forms/money-default";
import SearchInput from "@/lib/components/search-input";
import WorkMenuForm from "../../work-menus/work-menu-form";
import { createWorkMenuReturning } from "../../work-menus/actions";
import type { FolderActionResult, FormState } from "../actions";

type SetWithItems = {
  set: WorkMenuSet;
  items: { menu: WorkMenuItem; position: number }[];
  // 案2: セットに含まれる部品。価格は展開時にその受注の車種で解決する（quantity を反映）。
  // 部品なしの既存セットは空配列で従来どおり動く。
  parts?: { part: PartsInventory; quantity: number; position: number }[];
};

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  initialItems: OrderItem[];
  initialDiscount: number;
  initialDeposit: number;
  // 見積書 / 請求書の備考、整備写真フォルダ URL も同じフォームで保存する。
  // null は未入力扱い。
  initialEstimateNotes: string | null;
  initialInvoiceNotes: string | null;
  initialPhotoFolderUrl: string | null;
  // Googleドライブ連携 段階4: 連携状態と子フォルダ作成。
  //   googleConnected     : 店舗が Google ドライブを連携済みか（未連携ならボタン無効）。
  //   initialDriveFolderId: アプリが作った受注子フォルダの Drive ID（あれば「開く」表示）。
  //   createFolderAction  : 子フォルダを作成/確認するサーバーアクション（order.id バインド済）。
  googleConnected?: boolean;
  initialDriveFolderId?: string | null;
  createFolderAction?: () => Promise<FolderActionResult>;
  // 「メニューから追加」「セットから追加」picker 用のマスター一覧
  allMenus: WorkMenuItem[];
  allSetsWithItems: SetWithItems[];
  // 「部品在庫から追加」picker 用の部品マスター一覧（deleted_at IS NULL かつ
  // show_in_detail = true のアクティブ部品のみ、display_order 順で渡される前提）。
  // Step 1 で追加。空配列で省略可能（部品未登録環境でもボタンは出すが一覧は空表示）。
  allParts?: PartsInventory[];
  // 車種別定価ピッカー（Step 3-2b）用の variant 一覧（全ユーザー分。deleted_at IS NULL、
  // display_order 順）。受注の vehicle.model に一致する variant がある部品行に⭐バッジを出し、
  // その variant.list_price で parts_cost を上書きする。空配列で省略可能。
  allVariants?: PartsInventoryVariant[];
  // 受注の車両（Step 3-2b）。null のときは⭐機能は無効化（通常ピッカーとして動く）。
  vehicle?: Vehicle | null;
  // 受注の顧客（業販対応 第二歩-2a）。customer.customer_type === 'business' のとき、
  // 部品(variant)と作業メニューの markup_rate を適用して業販価格で明細に入れる。
  // null や 'personal' のときは従来どおり（掛け率を一切かけない）。
  customer?: Customer | null;
  // 業務カテゴリ（アクティブのみ、display_order 昇順）
  allCategories: WorkItemCategory[];
  // 受注の在庫状態（Step 2）。確保済み(reserved_at)/消費済み(consumed_at)のとき、明細編集に対して
  // 「一度ステータスを戻して在庫を解除してから直す」案内バナーを出す。null は未確保/未消費。
  reservedAt?: string | null;
  consumedAt?: string | null;
  // メニュー id → 標準間接材料スナップショット候補（Step 5）。
  // メニュー追加・セット追加時に明細へコピーする。空オブジェクトで省略可能。
  indirectByMenu?: Record<string, IndirectMaterialEntry[]>;
};

// カテゴリ名から推奨される税区分を返す。
function defaultTaxCategoryFor(categoryName: string | undefined): TaxCategory {
  return categoryName === "車検法定費用" ? "shaken_non_tax" : "taxable";
}

// 旧フィールド (type / tax_free) からカテゴリ名を推定（後方互換のフォールバック）。
function legacyCategoryNameFromOldFields(item: OrderItem): string {
  if (item.type === "shaken" && item.tax_free === true) return "車検法定費用";
  if (item.type === "shaken") return "車検整備";
  return "整備";
}

// マスターのデフォルト値から ItemRow を作る。
//
// メニュー単機能化 段1 (2026-06-10):
//   メニューは「1金額の項目」になった。売値は default_unit_price 一本。
//   旧 default_labor_cost / default_parts_cost はフォーム上は退役したが、DB側は段1ではまだ
//   列が残っているため、後方互換のため売値の取り出しは下記の優先順で行う:
//     1) default_unit_price > 0 ならそれを採用 (新仕様で保存されたメニュー)
//     2) それが 0 のときは default_labor_cost + default_parts_cost を合算 (旧データ救済)
//   業販対応 (段1で意味変更): isBusiness && m.markup_rate があれば 売値 × markup_rate を採用。
//   明細フォーム側は段1では既存の労務/部品代スロットを保持しているため、メニュー由来の売値は
//   「labor_cost」スロットに入れる (旧「工賃」相当の見た目を維持)。段2で列統合する際に
//   「金額」スロットへ正式に移行する予定。
function rowFromMenu(
  m: WorkMenuItem,
  indirectByMenu: Record<string, IndirectMaterialEntry[]>,
  isBusiness: boolean,
): ItemRow {
  const baseAmount =
    m.default_unit_price > 0
      ? m.default_unit_price
      : m.default_labor_cost + m.default_parts_cost;
  const rate = m.markup_rate;
  const amountNum =
    isBusiness && rate != null && Number.isFinite(rate)
      ? Math.round(baseAmount * rate)
      : baseAmount;
  const amountStr = amountNum > 0 ? String(amountNum) : "";

  // 原価には掛け率をかけない (粗利計算は素の原価で行う)。
  // メニューの原価は labor_cost_price に統一済み (段1)。
  const costPrice = m.labor_cost_price ?? 0;
  return {
    // メニュー由来は必ず作業行。
    kind: "labor",
    name: m.work_name,
    // 段1: メニューは部品リンク (linked_part_id) を持たない設計に変更。
    // 既存データで part_name が入っているメニューは残存表示する (新規からは空)。
    part_name: m.part_name ?? "",
    note: "",
    quantity: String(m.default_quantity ?? 1),
    // 売値は「labor_cost」スロットに入れる (段2-1で UI 上は「単価」1列に統合済み)。
    labor_cost: amountStr,
    parts_cost: "",
    // unit_price は既存の自動計算ロジック (labor + parts) に乗る。
    unit_price: amountStr !== "" ? amountStr : String(m.default_unit_price ?? 0),
    labor_cost_price: costPrice > 0 ? String(costPrice) : "",
    parts_cost_price: "",
    source_menu_id: m.id,
    // 段1: 部品リンクは退役。新規メニューは linked_part_id を持たないが、
    // 既存データに残っている場合は明細にもそのまま引き継ぐ (在庫連動の互換のため)。
    linked_part_id: m.linked_part_id ?? "",
    // 間接材料は段1でも維持 (在庫の確保/消費・粗利計算で使用)。
    indirect_materials: indirectByMenu[m.id] ?? [],
    tax_category: m.tax_category ?? "taxable",
    item_category_id: m.item_category_id ?? "",
    // 業販対応 段2-1: 参考定価は掛け率をかける前の素の売値 (baseAmount)。
    // 法人時の「参考定価」列で表示。個人時は表示しないが保存はしておく。
    list_price: baseAmount > 0 ? String(baseAmount) : "",
    // 段階3: メニュー由来は既定でまとめOFF（単独作業行）。
    parent_uid: "",
    _uid: nextRowUid(),
  };
}

// 部品マスター 1 件から「部品行」を作る。
// work_name は空（部品だけの行）。linked_part_id で在庫管理対象になる（在庫減算は Step 2 以降）。
// parts_cost = 売価（null は 0）、parts_cost_price = 原価。片方でも値があれば単価は自動計算され、
// 単価は「部品代」欄から編集する（rowFromMenu と同じ自動計算モードに揃える）。
//
// Step 3-2b: matchedVariant が渡され、その list_price が数値であれば、parts_cost を
// その車種別定価で上書きする（part_name は部品名のみで、品番は明細に出さない）。
// matchedVariant=null or list_price=null のときは従来どおり sale_price を使う。
//
// 業販対応 第二歩-2a: isBusiness=true かつ matchedVariant.markup_rate が数値のとき、
// parts_cost を「list_price × markup_rate」（四捨五入）で入れる＝業販価格。
// 個人(personal)や rate が無い variant のときは従来どおり定価をそのまま入れる。
// 原価(parts_cost_price)には掛け率をかけない（素の原価で粗利計算する）。
function rowFromPart(
  p: PartsInventory,
  categoryId: string,
  matchedVariant: PartsInventoryVariant | null,
  isBusiness: boolean,
): ItemRow {
  const listPrice =
    matchedVariant?.list_price != null
      ? matchedVariant.list_price
      : (p.sale_price ?? 0);
  const rate = matchedVariant?.markup_rate;
  const partsCostNum =
    isBusiness && rate != null && Number.isFinite(rate)
      ? Math.round(listPrice * rate)
      : listPrice;
  const cost = p.cost_price ?? 0;
  return {
    // 部品在庫由来は必ず部品行。
    kind: "part",
    name: "",
    part_name: p.name,
    note: "",
    quantity: "1",
    labor_cost: "",
    // 売価は 0 でも明示的に入れて「自動計算（内訳あり）」モードにする。
    parts_cost: String(partsCostNum),
    parts_cost_price: cost > 0 ? String(cost) : "",
    labor_cost_price: "",
    unit_price: String(partsCostNum),
    source_menu_id: "",
    linked_part_id: p.id,
    indirect_materials: [],
    tax_category: "taxable",
    item_category_id: categoryId,
    // 業販対応 段2-1: 参考定価は掛け率をかける前の素の定価 (listPrice)。
    // 法人時の「参考定価」列で表示。個人時は表示しないが保存はしておく。
    list_price: listPrice > 0 ? String(listPrice) : "",
    // 段階3: 部品在庫からの追加は既定でまとめOFF（別行＝自店式）。まとめは作業行側のチェックで行う。
    parent_uid: "",
    _uid: nextRowUid(),
  };
}

// 受注明細の1行を、作業メニュー登録フォーム（WorkMenuForm）の初期値に変換する。
// メニューは「1メニュー＝1金額」構造なので、明細の対応フィールドをメニューの欄に流し込む:
//   作業内容(name) → メニュー名(work_name)。空なら部品名で補う。
//   単価(unit_price) → 金額/売値(default_unit_price)。フォームの「金額」欄に入る。
//   原価(labor_cost_price ?? parts_cost_price) → メニュー原価(labor_cost_price)。
//   数量・税区分・業務カテゴリもそのまま引き継ぐ。掛率(markup_rate)は明細が持たないので未設定。
// id 等は使われないが WorkMenuItem 型を満たすためにダミーを詰める（フォームは値の prefill にのみ使う）。
function rowToMenuInitial(r: ItemRow): WorkMenuItem {
  const unit = Number(r.unit_price) || 0;
  const qty = Number(r.quantity) || 1;
  const cost = Number(r.labor_cost_price || r.parts_cost_price) || 0;
  return {
    id: "",
    user_id: "",
    work_name: r.name.trim() || r.part_name.trim() || "",
    part_name: null,
    category: "normal",
    default_quantity: qty,
    default_unit_price: unit,
    default_labor_cost: 0,
    default_parts_cost: 0,
    labor_cost_price: cost,
    parts_cost_price: 0,
    tax_free: r.tax_category === "shaken_non_tax",
    display_order: 0,
    memo: null,
    deleted_at: null,
    tax_category: r.tax_category,
    item_category_id: r.item_category_id || null,
    linked_part_id: null,
    markup_rate: null,
    created_at: "",
    updated_at: "",
  };
}

// 明細作り直し 段階2 (2026-07-11): 手入力行の種別。UI 専用の概念で、DB（OrderItem）には
// 保存しない（保存データは従来どおり work_name / part_name / linked_part_id で表現する）。
//   labor = 作業行（名前は work_name に入る）
//   part  = 部品行（名前は part_name に入る。work_name は空のまま）
// 読み込み時は toRow が既存フィールドから種別を推定するため、保存→再読込で種別は自然に復元される。
type ItemKind = "labor" | "part";

type ItemRow = {
  // 明細作り直し 段階2: 行の種別（UI 専用・非保存）。簡易入力の「作業/部品」トグルと、
  // どちらの名前欄（name / part_name）を主として編集するかを制御する。
  kind: ItemKind;
  // 旧 name を work_name にリネーム済み。OrderItem.work_name と対応する。
  name: string;
  // 部品名（任意、マスター対象）
  part_name: string;
  // 補足（任意、マスター対象外）
  note: string;
  quantity: string;
  // 空文字 = 未入力（内訳なし）。片方でも値があれば内訳ありとみなし単価は自動計算される。
  labor_cost: string;
  parts_cost: string;
  unit_price: string;
  // 原価（社内管理用）。空文字 = 未入力（0 として扱う）。粗利計算と DB 保存に使う。
  labor_cost_price: string;
  parts_cost_price: string;
  // 作業メニューマスターから挿入された場合のみセット。null/空文字は手入力扱い。
  source_menu_id: string;
  // 部品マスター（parts_inventory）への直接リンク。空文字 = 手入力 / 在庫管理対象外。
  // メニュー経由で伝播するが、受注明細フォームから直接編集する UI は今は持たない。
  linked_part_id: string;
  // 間接材料スナップショット（Step 5）。メニュー追加時にコピー、フォームから直接編集はしない。
  // 在庫減算と粗利計算でのみ使用。明細表示・PDF には出さない。
  indirect_materials: IndirectMaterialEntry[];
  // 税区分（システム固定: 'taxable' | 'shaken_non_tax'）。
  tax_category: TaxCategory;
  // 業務カテゴリ id。空文字 = 未設定（互換目的、通常は必ず設定される）。
  item_category_id: string;
  // 業販対応 段2-1: 1個あたりの参考定価 (法人受注のみ表示)。空文字 = 未保存（過去明細）。
  list_price: string;
  // 明細作り直し 段階3: 「1行にまとめる」で親作業行に結合されている部品行が持つ、
  //   親作業行の _uid。空文字 = まとめOFF（単独行）。保存時は OrderItem.parent_uid に落とす。
  parent_uid: string;
  // UI 専用: 「+ 補足」ボタンで明示的に展開した行で true。
  // note に値がある行は自動展開なのでこのフラグを見ない。保存対象外。
  _noteExpanded?: boolean;
  // UI 専用（段階2）: 「詳細」パネル（原価・定価・業販・マスター登録・補足）を展開している行で true。
  // 保存対象外（toItem で詰めない）。
  _detailOpen?: boolean;
  // UI 専用: ドラッグ並べ替え（@dnd-kit）の安定キー。行オブジェクトは更新で作り直されるため、
  // 配列 index ではなくこの uid を sortable id / React key に使う。保存対象外（toItem で詰めない）。
  _uid?: string;
};

// ドラッグ並べ替え用の UI 専用 uid を採番する。Date.now/Math.random は使わず（純粋性ルール対策）、
// モジュール内カウンタで単調増加させる。行生成（factory）はレンダーではなくイベント/初期化で呼ばれる。
let _rowUidCounter = 0;
function nextRowUid(): string {
  _rowUidCounter += 1;
  return `row_${_rowUidCounter}`;
}

// 段階3: 保存済み uid（"row_N"）を復元する受注では、その最大 N までカウンタを進めておき、
// 以降 nextRowUid() が生成する新規 uid が既存 uid と衝突しないようにする。
// （まとめの親子リンクは uid 一致で解決するため、衝突は致命的。初期化時に一度だけ呼ぶ。）
function seedRowUidCounter(items: OrderItem[]): void {
  for (const it of items) {
    const uid = it.uid;
    if (typeof uid !== "string") continue;
    const m = /^row_(\d+)$/.exec(uid);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > _rowUidCounter) _rowUidCounter = n;
  }
}

// 工賃 / 部品代の少なくとも片方に値が入っているか（= 単価が自動計算モード）
function hasBreakdown(r: ItemRow): boolean {
  return r.labor_cost !== "" || r.parts_cost !== "";
}

// OrderItem → ItemRow の変換。新フィールドが無い既存データは旧フィールド (type/tax_free)
// から推定したカテゴリ名を allCategories から逆引きしてフォールバックする。
function toRow(i: OrderItem, allCategories: WorkItemCategory[]): ItemRow {
  // tax_category: 新フィールド > 旧 tax_free からの派生
  const taxCategory: TaxCategory =
    i.tax_category ?? (i.tax_free === true ? "shaken_non_tax" : "taxable");
  // item_category_id: 新フィールド > 旧 type/tax_free からのカテゴリ名逆引き
  let itemCategoryId = i.item_category_id ?? "";
  if (!itemCategoryId) {
    const fallbackName = legacyCategoryNameFromOldFields(i);
    itemCategoryId =
      allCategories.find((c) => c.name === fallbackName)?.id ?? "";
  }
  // 段階2: 種別を既存フィールドから推定（段階1調査の分類ルールと同一）。
  //   work_name が空で、部品名か在庫リンクを持つ行 → 部品行。それ以外 → 作業行。
  //   これにより保存→再読込で「作業/部品」トグルの状態が自然に復元される。
  const workEmpty = !(i.work_name && i.work_name.trim() !== "");
  const hasPart =
    (i.part_name != null && i.part_name.trim() !== "") ||
    (i.linked_part_id != null && i.linked_part_id !== "");
  const kind: ItemKind = workEmpty && hasPart ? "part" : "labor";
  return {
    kind,
    name: i.work_name,
    part_name: i.part_name ?? "",
    note: i.note ?? "",
    quantity: String(i.quantity),
    labor_cost: i.labor_cost !== undefined ? String(i.labor_cost) : "",
    parts_cost: i.parts_cost !== undefined ? String(i.parts_cost) : "",
    unit_price: String(i.unit_price),
    // 原価: 既存データは migration で 0 にバックフィル済み。0 は空文字扱いで UI を散らかさない。
    labor_cost_price:
      i.labor_cost_price !== undefined && i.labor_cost_price > 0
        ? String(i.labor_cost_price)
        : "",
    parts_cost_price:
      i.parts_cost_price !== undefined && i.parts_cost_price > 0
        ? String(i.parts_cost_price)
        : "",
    source_menu_id: i.source_menu_id ?? "",
    linked_part_id: i.linked_part_id ?? "",
    indirect_materials: Array.isArray(i.indirect_materials)
      ? i.indirect_materials
      : [],
    tax_category: taxCategory,
    item_category_id: itemCategoryId,
    // 業販対応 段2-1: 既存 OrderItem に list_price があれば引き継ぐ (過去明細は未定義)。
    list_price:
      i.list_price !== undefined && i.list_price > 0
        ? String(i.list_price)
        : "",
    // 段階3: まとめ結合の親参照。子（部品行）が持つ。無ければ空文字（まとめOFF）。
    parent_uid: typeof i.parent_uid === "string" ? i.parent_uid : "",
    // 段階3: 保存済み uid があれば _uid として復元（親の同一性を維持し、子の parent_uid と一致させる）。
    // 無ければ新規採番。seedRowUidCounter 済みなので新規 uid は既存 uid と衝突しない。
    _uid:
      typeof i.uid === "string" && i.uid !== "" ? i.uid : nextRowUid(),
  };
}

// ItemRow → OrderItem。新フィールドを書き、ローカル totals 計算用に旧 type/tax_free
// も派生して書く（categoryName ベース）。サーバー側 parseItems も同じ派生を行うため、
// この出力をそのまま JSON 化して送ってよい。
function toItem(r: ItemRow, categoryName: string | null): OrderItem {
  const quantity = Number(r.quantity) || 0;
  const base = ((): OrderItem => {
    if (hasBreakdown(r)) {
      const labor = Number(r.labor_cost) || 0;
      const parts = Number(r.parts_cost) || 0;
      const it: OrderItem = {
        work_name: r.name,
        quantity,
        unit_price: labor + parts,
      };
      if (r.labor_cost !== "") it.labor_cost = labor;
      if (r.parts_cost !== "") it.parts_cost = parts;
      return it;
    }
    return {
      work_name: r.name,
      quantity,
      unit_price: Number(r.unit_price) || 0,
    };
  })();
  // optional フィールドは値があるときだけ詰める（jsonb を不要に肥大させない）
  if (r.part_name.trim() !== "") base.part_name = r.part_name.trim();
  if (r.note.trim() !== "") base.note = r.note.trim();
  if (r.source_menu_id !== "") base.source_menu_id = r.source_menu_id;
  // 部品マスターリンク（Step 3 で追加）。空文字は手入力扱いで省略する。
  if (r.linked_part_id !== "") base.linked_part_id = r.linked_part_id;
  // 間接材料スナップショット（Step 5）。空配列は省略して jsonb を肥大化させない。
  if (r.indirect_materials.length > 0) {
    base.indirect_materials = r.indirect_materials;
  }
  // 原価は空でなければ数値化、空なら省略（後方互換: 既存データは migration で 0 で埋まる）。
  if (r.labor_cost_price !== "") {
    base.labor_cost_price = Number(r.labor_cost_price) || 0;
  }
  if (r.parts_cost_price !== "") {
    base.parts_cost_price = Number(r.parts_cost_price) || 0;
  }
  // 業販対応 段2-1: 参考定価は空でなければ数値化。保存しておけば後で法人化したとき使える。
  if (r.list_price !== "") {
    const n = Number(r.list_price);
    if (Number.isFinite(n) && n > 0) base.list_price = Math.round(n);
  }
  // 新フィールド
  base.tax_category = r.tax_category;
  if (r.item_category_id) base.item_category_id = r.item_category_id;
  // 旧フィールド派生（calculateTotals が type/tax_free を見るので必要）
  if (r.tax_category === "shaken_non_tax") {
    base.type = "shaken";
    base.tax_free = true;
  } else if (r.tax_category === "taxable" && categoryName === "車検整備") {
    base.type = "shaken";
  }
  return base;
}

const emptyRow = (
  itemCategoryId: string,
  taxCategory: TaxCategory,
): ItemRow => ({
  // 手入力の新規行は既定で「作業」。ユーザーが種別トグルで部品に切替できる。
  kind: "labor",
  name: "",
  part_name: "",
  note: "",
  quantity: "1",
  labor_cost: "",
  parts_cost: "",
  unit_price: "0",
  labor_cost_price: "",
  parts_cost_price: "",
  source_menu_id: "",
  linked_part_id: "",
  indirect_materials: [],
  tax_category: taxCategory,
  item_category_id: itemCategoryId,
  list_price: "",
  parent_uid: "",
  _uid: nextRowUid(),
});

// 既存 items を category id ベースの Record に振り分ける。
// item_category_id が空または allCategories に無い場合は旧 type/tax_free から
// カテゴリ名を逆引きして近い id に振る。フォールバックすら見つからない場合は
// allCategories[0] に入れる（全くカテゴリが無い極端なケースは想定外）。
function splitByCategory(
  items: OrderItem[],
  allCategories: WorkItemCategory[],
): Record<string, ItemRow[]> {
  const result: Record<string, ItemRow[]> = {};
  // すべてのアクティブカテゴリのキーを先に確保（空セクションも表示するため）。
  for (const c of allCategories) result[c.id] = [];
  for (const it of items) {
    const r = toRow(it, allCategories);
    const key =
      r.item_category_id && (result[r.item_category_id] !== undefined)
        ? r.item_category_id
        : (allCategories[0]?.id ?? "_orphan");
    if (!result[key]) result[key] = [];
    // r.item_category_id が空だった場合は割り当てたキーで補正する。
    if (!r.item_category_id) r.item_category_id = key;
    result[key].push(r);
  }
  return result;
}

const cellInputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-50 dark:focus:ring-zinc-50";

const labelClass =
  "mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300";

// 明細作り直し 段階1 (2026-07-11): 各行の単価が「業販」か「定価」かを示す控えめなバッジ。
// 判定は受注の顧客区分のみ（business=業販 / personal・未設定=定価）。これは表示専用で、
// 金額の値・計算・保存・PDF・在庫連携には一切影響しない（バッジを足すだけ）。
//   ※ 部品行は二階建て価格解決で business=業販価格 / personal=定価が既に unit_price に入る。
//   ※ 作業行も rowFromMenu で business かつ markup_rate 有りなら業販価格が入る（無ければ定価のまま）。
//     バッジ基準は受注の顧客区分に統一する（行ごとの掛け率有無では出し分けない）。
function PriceKindBadge({ isBusiness }: { isBusiness: boolean }) {
  return isBusiness ? (
    <span
      className="rounded bg-orange-100 px-1 py-0.5 text-[9px] font-medium leading-none text-orange-700 dark:bg-orange-950/60 dark:text-orange-300"
      title="業者価格（業販）で入っている金額です"
    >
      業販
    </span>
  ) : (
    <span
      className="rounded bg-zinc-200 px-1 py-0.5 text-[9px] font-medium leading-none text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
      title="通常価格（定価）で入っている金額です"
    >
      定価
    </span>
  );
}

export default function ItemsForm({
  action,
  initialItems,
  initialDiscount,
  initialDeposit,
  initialEstimateNotes,
  initialInvoiceNotes,
  initialPhotoFolderUrl,
  googleConnected = false,
  initialDriveFolderId = null,
  createFolderAction,
  allMenus,
  allSetsWithItems,
  allCategories,
  allParts = [],
  allVariants = [],
  vehicle = null,
  customer = null,
  reservedAt = null,
  consumedAt = null,
  indirectByMenu = {},
}: Props) {
  // 業販対応 第二歩-2a: 顧客が法人のとき、マスターの markup_rate を適用して
  // 業販価格で明細に入れる。null/personal のときは従来どおり（掛けない）。
  const isBusiness = customer?.customer_type === "business";
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    undefined,
  );

  // カテゴリ id → name の逆引き（旧 type/tax_free 派生 / セクション見出し / 保存JSON で使用）
  const categoryNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of allCategories) m.set(c.id, c.name);
    return m;
  }, [allCategories]);

  // category_name_map_json: サーバー側 parseItems が旧 type/tax_free を派生する際に使う。
  const categoryNameMapJson = useMemo(() => {
    return JSON.stringify(Object.fromEntries(categoryNameById));
  }, [categoryNameById]);

  // 作業セットに含まれる部品を展開するとき用の variant 解決マップ（PartPickerModal と同じ二段構え）。
  //   車種一致（タグあり）を全走査で先に確定し、無い部品だけ標準（車種空）をフォールバック。
  // PartPickerModal 内のロジックと同一だが、あちらはモーダル内 useMemo なのでここで別途用意する。
  const effectiveVariantByPart = useMemo(() => {
    const target = normalizeForVehicleMatch(vehicle?.model ?? "");
    const general = new Map<string, PartsInventoryVariant>();
    for (const v of allVariants) {
      if (v.vehicle_tags.length !== 0) continue; // 標準（車種空）のみ
      if (general.has(v.part_id)) continue; // 先頭（display_order 最小）を採用
      general.set(v.part_id, v);
    }
    const map = new Map<string, PartsInventoryVariant>(general);
    if (target) {
      const vehicleMatch = new Map<string, PartsInventoryVariant>();
      for (const v of allVariants) {
        if (v.vehicle_tags.length === 0) continue; // 標準は車種一致の対象外
        if (vehicleMatch.has(v.part_id)) continue;
        const hit = v.vehicle_tags.some(
          (t) => normalizeForVehicleMatch(t) === target,
        );
        if (hit) vehicleMatch.set(v.part_id, v);
      }
      for (const [pid, v] of vehicleMatch) map.set(pid, v);
    }
    return map;
  }, [allVariants, vehicle?.model]);

  // 初期 state: 既存 items を category id 単位の Record に振り分ける。
  // カテゴリ未登録（極端なケース）でも壊れないようフォールバック空オブジェクトで初期化。
  const [rowsByCat, setRowsByCat] = useState<Record<string, ItemRow[]>>(() => {
    // 段階3: まとめの親子リンク（uid / parent_uid）を復元する前に、保存済み uid の最大値まで
    // カウンタを進めて新規 uid の衝突を防ぐ。
    seedRowUidCounter(initialItems);
    const split = splitByCategory(initialItems, allCategories);
    // 何も無い受注（新規）の場合、最初のカテゴリに空 1 行を置いて即入力できる UX に。
    if (initialItems.length === 0 && allCategories.length > 0) {
      const head = allCategories[0];
      split[head.id] = [emptyRow(head.id, defaultTaxCategoryFor(head.name))];
    }
    return split;
  });

  // 0 / 未入力は空表示（placeholder="—"）。正の値のみ初期表示する。
  const [discount, setDiscount] = useState(moneyDefault(initialDiscount));
  const [deposit, setDeposit] = useState(moneyDefault(initialDeposit));
  const [estimateNotes, setEstimateNotes] = useState(
    initialEstimateNotes ?? "",
  );
  const [invoiceNotes, setInvoiceNotes] = useState(initialInvoiceNotes ?? "");
  const [photoFolderUrl, setPhotoFolderUrl] = useState(
    initialPhotoFolderUrl ?? "",
  );

  // Googleドライブ連携 段階4: 受注子フォルダの作成状態。
  const [driveFolderId, setDriveFolderId] = useState<string | null>(
    initialDriveFolderId,
  );
  const [folderError, setFolderError] = useState<string | null>(null);
  const [folderPending, startFolder] = useTransition();

  function handleCreateFolder() {
    if (!createFolderAction) return;
    setFolderError(null);
    startFolder(async () => {
      const res = await createFolderAction();
      if ("success" in res) {
        setDriveFolderId(res.folderId);
        // 既存の「整備写真フォルダ」表示UI（URL欄）にも反映する。
        setPhotoFolderUrl(res.url);
      } else {
        setFolderError(res.error);
      }
    });
  }

  // ピッカーモーダルの開閉
  const [menuPickerOpen, setMenuPickerOpen] = useState(false);
  const [setPickerOpen, setSetPickerOpen] = useState(false);
  const [partPickerOpen, setPartPickerOpen] = useState(false);

  // 表示するセクションの並び: アクティブなカテゴリ display_order 順 +
  // それに無い orphan カテゴリ id（行を持つが allCategories に無いもの）を末尾に。
  const sectionOrder = useMemo(() => {
    const ids = allCategories.map((c) => c.id);
    const knownSet = new Set(ids);
    const orphans: string[] = [];
    for (const id of Object.keys(rowsByCat)) {
      if (!id) continue;
      if (!knownSet.has(id) && (rowsByCat[id]?.length ?? 0) > 0) {
        orphans.push(id);
      }
    }
    return [...ids, ...orphans];
  }, [allCategories, rowsByCat]);

  // セクション set helper: 指定 categoryId の rows を更新する。
  function setRowsFor(categoryId: string, rows: ItemRow[]) {
    setRowsByCat((prev) => ({ ...prev, [categoryId]: rows }));
  }

  // 一括追加: 各 ItemRow を item_category_id 単位で末尾に追加。
  // categoryId が allCategories に無いものはそのキーに新規バケットを作る（orphan）。
  function addRowsByCategory(newRows: ItemRow[]) {
    function isEmptyRow(r: ItemRow): boolean {
      return (
        r.name.trim() === "" &&
        r.part_name.trim() === "" &&
        r.note.trim() === "" &&
        r.labor_cost === "" &&
        r.parts_cost === "" &&
        (r.unit_price === "" || r.unit_price === "0")
      );
    }
    setRowsByCat((prev) => {
      const next: Record<string, ItemRow[]> = { ...prev };
      for (const row of newRows) {
        const key = row.item_category_id;
        if (!key) continue;
        const list = next[key] ?? [];
        if (list.length === 1 && isEmptyRow(list[0])) {
          next[key] = [row];
        } else {
          next[key] = [...list, row];
        }
      }
      return next;
    });
  }

  function handleMenuPickerConfirm(menus: WorkMenuItem[]) {
    // メニューに item_category_id が無い極稀ケースは「整備」相当に振る。
    const fallbackId = allCategories.find((c) => c.name === "整備")?.id ?? "";
    const rows = menus.map((m) => {
      const row = rowFromMenu(m, indirectByMenu, isBusiness);
      if (!row.item_category_id) row.item_category_id = fallbackId;
      return row;
    });
    addRowsByCategory(rows);
    setMenuPickerOpen(false);
  }

  function handleSetPickerConfirm(set: SetWithItems) {
    const fallbackId = allCategories.find((c) => c.name === "整備")?.id ?? "";
    const menuRows = set.items.map((x) => {
      const row = rowFromMenu(x.menu, indirectByMenu, isBusiness);
      if (!row.item_category_id) row.item_category_id = fallbackId;
      return row;
    });
    // 案2: セットに含まれる部品も明細に追加。価格はこの受注の車種で解決（法人=業販/個人=定価）、
    // 数量はセットの quantity を反映する。部品ピッカーからの追加と同じ rowFromPart を使う。
    const partFallbackId =
      allCategories.find((c) => c.name === "整備")?.id ??
      allCategories[0]?.id ??
      "";
    const partRows = (set.parts ?? []).map((x) => {
      const row = rowFromPart(
        x.part,
        partFallbackId,
        effectiveVariantByPart.get(x.part.id) ?? null,
        isBusiness,
      );
      const qty = Number(x.quantity);
      if (Number.isFinite(qty) && qty > 0) row.quantity = String(qty);
      return row;
    });
    addRowsByCategory([...menuRows, ...partRows]);
    setSetPickerOpen(false);
  }

  // 「部品在庫から追加」: 選択部品を部品行に変換し、業務カテゴリ「整備」（無ければ先頭）の
  // セクションへ載せる。部品行は work_name 空・item_category_id を持つため
  // splitByCategory / addRowsByCategory のどちらでも捨てられず、再読込後も同じ位置に出る。
  //
  // Step 3-2b: PartPickerModal が車種一致した variant の Map を一緒に渡してくる。
  // 該当部品があれば rowFromPart に variant を渡して定価を上書きする。一致が無ければ null。
  function handlePartPickerConfirm(
    parts: PartsInventory[],
    matchedByPart: Map<string, PartsInventoryVariant>,
  ) {
    const fallbackId =
      allCategories.find((c) => c.name === "整備")?.id ??
      allCategories[0]?.id ??
      "";
    const rows = parts.map((p) =>
      rowFromPart(p, fallbackId, matchedByPart.get(p.id) ?? null, isBusiness),
    );
    addRowsByCategory(rows);
    setPartPickerOpen(false);
  }

  // 行の ☆ ボタン: その行を作業メニューマスター（work_menu_items）に登録する。
  // 旧仕様（確認ダイアログ→一発INSERT）から、既存のメニュー登録フォーム（WorkMenuForm）を
  // ポップアップで開く方式に変更。明細の情報を初期値として詰めた状態で開き、ユーザーが確認・
  // 追記してから登録する。登録成功時は当該 row.source_menu_id に新規 id をセットして二重登録抑止。
  const [menuModalRow, setMenuModalRow] = useState<{
    categoryId: string;
    index: number;
  } | null>(null);

  function openMenuModal(categoryId: string, index: number) {
    setMenuModalRow({ categoryId, index });
  }

  function handleMenuRegistered(id: string) {
    if (!menuModalRow) return;
    const { categoryId, index } = menuModalRow;
    setRowsByCat((prev) => {
      const cur = prev[categoryId] ?? [];
      return {
        ...prev,
        [categoryId]: cur.map((row, idx) =>
          idx === index ? { ...row, source_menu_id: id } : row,
        ),
      };
    });
    setMenuModalRow(null);
  }

  // 全セクションの item 配列を組み立てて totals 計算 & 保存 JSON を作る。
  // 並び順は sectionOrder で確定（display_order 昇順 + orphan 末尾）。
  const allItems: OrderItem[] = useMemo(() => {
    // 段階3: どの作業行が「子を持つ親」かを先に確定する。
    //   親作業行にだけ uid を焼き付け、子部品行に parent_uid を焼き付ける。
    //   まとめに関与しない行には一切付けない（＝既存明細と同一形・後方互換）。
    const referencedParents = new Set<string>();
    for (const catId of sectionOrder) {
      for (const r of rowsByCat[catId] ?? []) {
        if (r.parent_uid && r.parent_uid !== "") {
          referencedParents.add(r.parent_uid);
        }
      }
    }
    const out: OrderItem[] = [];
    for (const catId of sectionOrder) {
      const list = rowsByCat[catId] ?? [];
      const name = categoryNameById.get(catId) ?? null;
      for (const r of list) {
        const it = toItem(r, name);
        // 親: 子から参照されている作業行にだけ uid を付ける。
        if (r._uid && referencedParents.has(r._uid)) it.uid = r._uid;
        // 子: まとめ結合されている部品行に parent_uid を付ける。
        if (r.parent_uid && r.parent_uid !== "") it.parent_uid = r.parent_uid;
        out.push(it);
      }
    }
    return out;
  }, [sectionOrder, rowsByCat, categoryNameById]);

  const totals = calculateTotals(
    allItems,
    Number(discount) || 0,
    Number(deposit) || 0,
  );
  const profit = calculateProfit(allItems);
  // 業販対応 段2-1: 法人受注で「参考定価の税込合計」を併記する。
  //   個人受注では使わない（表示しない）。list_price 未保存の過去明細は hasAny=false に寄与せず、
  //   過去受注を法人モードで開いても 0 表示にはならない（行が無ければ何も出さない仕様）。
  const listPriceTotals = calculateListPriceTotals(allItems);

  // 保存対象: 作業内容があるか、または部品名 / 部品リンクを持つ行（部品在庫から追加した行）。
  // 完全に空の行のみ除外する（サーバー側 parseItems の緩和条件と揃える）。
  const itemsToSave = allItems.filter(
    (i) =>
      i.work_name.trim() !== "" ||
      (i.part_name?.trim() ?? "") !== "" ||
      (i.linked_part_id?.trim() ?? "") !== "",
  );

  return (
    <form action={formAction} className="space-y-6">
      {(consumedAt || reservedAt) && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
          {consumedAt ? (
            <>
              ⚠️ この受注は在庫消費済みです（作業ステータス「完了」）。明細を変更する場合は、一度
              作業ステータスを「完了」から戻して在庫消費を取り消してから直してください（自動では差分調整されません）。
            </>
          ) : (
            <>
              ⚠️ この受注は在庫確保済みです（見積ステータス「了承済」）。明細を変更する場合は、一度
              見積ステータスを「了承済」から戻して確保を解除してから直してください（自動では差分調整されません）。
            </>
          )}
        </div>
      )}
      <input
        type="hidden"
        name="items_json"
        value={JSON.stringify(itemsToSave)}
      />
      <input
        type="hidden"
        name="category_name_map_json"
        value={categoryNameMapJson}
      />
      <input
        type="hidden"
        name="discount_amount"
        value={Number(discount) || 0}
      />
      <input
        type="hidden"
        name="deposit_amount"
        value={Number(deposit) || 0}
      />

      {/* 防御的 UI: 業務カテゴリが 1 件も無いと、明細はカテゴリ別セクション単位で描画される
          仕様のため入力欄が一切出ず明細追加できなくなる。通常はダッシュボードの遅延 seed
          （ensureSystemCategories）で 0 件にはならないが、万一の不整合時に操作不能で詰まないよう
          カテゴリ管理画面への導線を出す。 */}
      {allCategories.length === 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">
          <p className="font-medium">業務カテゴリが未登録です</p>
          <p className="mt-1 text-amber-700 dark:text-amber-400">
            明細は「整備」「車検整備」などの業務カテゴリごとに入力します。
            まずカテゴリ管理画面で業務カテゴリを追加してください。
          </p>
          <Link
            href="/dashboard/work-item-categories"
            className="mt-2 inline-block rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-zinc-900 dark:text-amber-300 dark:hover:bg-amber-950"
          >
            → 業務カテゴリを管理する
          </Link>
        </div>
      )}

      {/* カテゴリ単位の動的セクション。空セクションも一括追加ボタンを置くため表示する。
          orphan（allCategories に無いが行が存在する categoryId）は末尾にまとめて出す。 */}
      {sectionOrder.map((catId) => {
        const list = rowsByCat[catId] ?? [];
        const cat = allCategories.find((c) => c.id === catId);
        const sectionName = cat?.name ?? "（不明カテゴリ）";
        const sectionTaxCategory = defaultTaxCategoryFor(sectionName);
        return (
          <section key={catId}>
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                【{sectionName}】
              </h3>
              {!cat && (
                <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300">
                  削除済み
                </span>
              )}
              {cat?.is_system && (
                <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                  標準
                </span>
              )}
            </div>
            <ItemTableEditor
              rows={list}
              onChange={(next) => setRowsFor(catId, next)}
              categoryId={catId}
              categoryName={cat?.name ?? null}
              defaultTaxCategory={sectionTaxCategory}
              onRegisterRow={openMenuModal}
              isBusiness={isBusiness}
            />
          </section>
        );
      })}

      {/* 作業メニュー / 作業セットからの一括追加 */}
      <section>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMenuPickerOpen(true)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            📋 作業メニューから追加
          </button>
          <button
            type="button"
            onClick={() => setSetPickerOpen(true)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            📦 作業セットから追加
          </button>
          <button
            type="button"
            onClick={() => setPartPickerOpen(true)}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            🔩 部品在庫から追加
          </button>
          <p className="ml-1 self-center text-xs text-zinc-500 dark:text-zinc-400">
            選択した項目は業務カテゴリに応じて該当セクションに振り分けられます（部品は「整備」に入ります）。
          </p>
        </div>
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-3">
          <div>
            <label htmlFor="discount" className={labelClass}>
              割引金額
            </label>
            <input
              id="discount"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              placeholder="—"
              className={`${cellInputClass} text-right`}
            />
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              ※ 割引は課税の整備費用にのみ適用されます
            </p>
          </div>
          <div>
            <label htmlFor="deposit" className={labelClass}>
              預かり金
            </label>
            <input
              id="deposit"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              placeholder="—"
              className={`${cellInputClass} text-right`}
            />
          </div>
        </div>

        <div className="space-y-3">
        <dl className="space-y-1.5 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950">
          {totals.sections.normal.subtotal > 0 && (
            <Row
              label="整備小計"
              value={formatYen(totals.sections.normal.subtotal)}
            />
          )}
          {totals.sections.shakenTaxable.subtotal > 0 && (
            <Row
              label="車検課税小計"
              value={formatYen(totals.sections.shakenTaxable.subtotal)}
            />
          )}
          {totals.sections.shakenTaxFree.subtotal > 0 && (
            <Row
              label="車検非課税小計"
              value={formatYen(totals.sections.shakenTaxFree.subtotal)}
            />
          )}
          {totals.discount > 0 && (
            <Row
              label="値引き"
              value={`− ${formatYen(totals.discount)}`}
              divider
            />
          )}
          <Row
            label="課税対象額"
            value={formatYen(totals.taxableAmount)}
            divider
          />
          <Row label="消費税(10%)" value={formatYen(totals.tax)} />
          <Row label="合計" value={formatYen(totals.total)} emphasize />
          {/* 業販対応 段2-1: 法人時のみ、参考定価の税込合計を併記。
              list_price が1行も保存されていない（過去明細だけの受注など）ときは出さない。 */}
          {isBusiness && listPriceTotals.hasAny && (
            <Row
              label="参考定価合計（税込）"
              value={formatYen(listPriceTotals.total)}
            />
          )}
          {totals.deposit > 0 && (
            <>
              <Row label="預かり金" value={`− ${formatYen(totals.deposit)}`} />
              <Row
                label="差引請求額"
                value={formatYen(totals.balance)}
                emphasize
              />
            </>
          )}
        </dl>

        {/* 粗利サマリー（社内管理用）。calculateProfit を使い、税抜・値引き前ベースで集計。
            ⚠️ 見積書・請求書 PDF には出さない。 */}
        <dl className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900/60 dark:bg-amber-950/30">
          <div className="mb-1 flex items-baseline justify-between">
            <h4 className="text-xs font-semibold text-amber-800 dark:text-amber-300">
              粗利サマリー
            </h4>
            <span className="text-[10px] text-amber-700 dark:text-amber-400">
              社内管理用
            </span>
          </div>
          <Row label="売上合計" value={formatYen(profit.revenue)} />
          <Row label="原価合計" value={formatYen(profit.cost)} />
          <Row
            label="粗利"
            value={formatYen(profit.profit)}
            emphasize
          />
          <Row
            label="粗利率"
            value={`${profit.profitRatePercent.toFixed(1)}%`}
          />
          <p className="pt-1 text-[10px] text-amber-700 dark:text-amber-400">
            ※ 売上は税抜・値引き前の明細小計合計です。見積書・請求書には表示されません。
          </p>
        </dl>
        </div>
      </div>

      {/* 整備写真フォルダ URL / 帳票備考: 同じフォームで保存される。
          各 input/textarea の name 属性が server action（updateOrderItems）の
          formData.get(...) に対応する。 */}
      <div className="space-y-4">
        {/* Googleドライブ連携 段階4: 親「HIIRAGI受注写真」配下に受注子フォルダを自動作成。
            状態別に出し分け。手貼りURL欄（下）はフォールバックとして従来通り残す（排他にしない）。 */}
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/40">
          <div className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Google ドライブ 写真フォルダ
          </div>
          {!googleConnected ? (
            <div>
              <button
                type="button"
                disabled
                className="cursor-not-allowed rounded-md bg-zinc-300 px-3 py-1.5 text-sm text-zinc-600 opacity-70 dark:bg-zinc-700 dark:text-zinc-400"
              >
                📁 写真フォルダを作成
              </button>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                設定で Google ドライブを連携すると写真フォルダを自動作成できます。
              </p>
            </div>
          ) : driveFolderId ? (
            <a
              href={photoFolderUrl || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-white dark:border-zinc-600 dark:text-zinc-200"
            >
              📂 写真フォルダを開く ↗
            </a>
          ) : (
            <button
              type="button"
              onClick={handleCreateFolder}
              disabled={folderPending}
              className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-200 dark:text-zinc-900"
            >
              {folderPending ? "作成中…" : "📁 写真フォルダを作成"}
            </button>
          )}
          {folderError && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              {folderError}
            </p>
          )}
        </div>
        <div>
          <label
            htmlFor="photo_folder_url"
            className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            整備写真フォルダ（URL手入力）
          </label>
          <p className="mb-1 text-xs text-zinc-500 dark:text-zinc-400">
            Google Drive 等の整備写真を保管しているフォルダ URL。
            http:// または https:// で始まる URL を入力してください。
          </p>
          {photoFolderUrl &&
            /^https?:\/\//i.test(photoFolderUrl) && (
              <p className="mb-1 break-all text-xs text-zinc-500 dark:text-zinc-400">
                <span>登録URL: </span>
                <a
                  href={photoFolderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-300"
                >
                  {photoFolderUrl} ↗
                </a>
              </p>
            )}
          <input
            id="photo_folder_url"
            name="photo_folder_url"
            type="url"
            value={photoFolderUrl}
            onChange={(e) => setPhotoFolderUrl(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/..."
            className={cellInputClass}
          />
        </div>
        <div>
          <label
            htmlFor="estimate_notes"
            className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            見積書 備考
          </label>
          <p className="mb-1 text-xs text-zinc-500 dark:text-zinc-400">
            見積書 PDF / プレビューの備考欄に表示されます（顧客向け）。
          </p>
          <textarea
            id="estimate_notes"
            name="estimate_notes"
            rows={3}
            value={estimateNotes}
            onChange={(e) => setEstimateNotes(e.target.value)}
            className={cellInputClass}
          />
        </div>
        <div>
          <label
            htmlFor="invoice_notes"
            className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            請求書 備考
          </label>
          <p className="mb-1 text-xs text-zinc-500 dark:text-zinc-400">
            請求書 PDF / プレビューの備考欄に表示されます（顧客向け）。
          </p>
          <textarea
            id="invoice_notes"
            name="invoice_notes"
            rows={3}
            value={invoiceNotes}
            onChange={(e) => setInvoiceNotes(e.target.value)}
            className={cellInputClass}
          />
        </div>
      </div>

      {state?.error && (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {state.error}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {pending ? "保存中..." : "内容を保存"}
        </button>
      </div>

      {menuPickerOpen && (
        <MenuPickerModal
          allMenus={allMenus}
          allCategories={allCategories}
          onConfirm={handleMenuPickerConfirm}
          onClose={() => setMenuPickerOpen(false)}
        />
      )}
      {setPickerOpen && (
        <SetPickerModal
          sets={allSetsWithItems}
          allCategories={allCategories}
          onConfirm={handleSetPickerConfirm}
          onClose={() => setSetPickerOpen(false)}
        />
      )}
      {partPickerOpen && (
        <PartPickerModal
          allParts={allParts}
          allVariants={allVariants}
          vehicle={vehicle}
          isBusiness={isBusiness}
          onConfirm={handlePartPickerConfirm}
          onClose={() => setPartPickerOpen(false)}
        />
      )}
      {menuModalRow &&
        (() => {
          const r = rowsByCat[menuModalRow.categoryId]?.[menuModalRow.index];
          if (!r) return null;
          return (
            <MenuRegisterModal
              initial={rowToMenuInitial(r)}
              allCategories={allCategories}
              allParts={allParts}
              onSuccess={handleMenuRegistered}
              onClose={() => setMenuModalRow(null)}
            />
          );
        })()}
    </form>
  );
}

// ============================================
// 「☆ メニュー登録」モーダル
// ============================================
// 既存の作業メニュー登録フォーム（WorkMenuForm）をそのままポップアップで再利用する。
// 明細行から作った initial を prefill し、redirect しない createWorkMenuReturning を action に渡す。
// 登録成功（{ ok, id }）で onSuccess(id) が呼ばれ、親が行に source_menu_id をセットしてモーダルを閉じる。
function MenuRegisterModal({
  initial,
  allCategories,
  allParts,
  onSuccess,
  onClose,
}: {
  initial: WorkMenuItem;
  allCategories: WorkItemCategory[];
  allParts: PartsInventory[];
  onSuccess: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="my-8 w-full max-w-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 rounded-t-lg bg-white px-4 py-3 dark:bg-zinc-900">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            作業メニューに登録
          </h3>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            明細の内容を初期値として入れています。確認・追記して登録してください。登録後はこの受注画面に戻ります。
          </p>
        </div>
        <WorkMenuForm
          action={createWorkMenuReturning}
          initial={initial}
          allCategories={allCategories}
          allParts={allParts}
          submitLabel="メニューに登録"
          cancelHref="#"
          onSuccess={onSuccess}
          onCancel={onClose}
        />
      </div>
    </div>
  );
}

function ItemTableEditor({
  rows,
  onChange,
  categoryId,
  categoryName,
  defaultTaxCategory,
  onRegisterRow,
  isBusiness,
}: {
  rows: ItemRow[];
  onChange: (rows: ItemRow[]) => void;
  categoryId: string;
  // 小計計算 (toItem) 内で旧 type/tax_free を派生するために必要。
  categoryName: string | null;
  // セクションの推奨税区分。「+ 明細行を追加」で空行を作るときに使う。
  defaultTaxCategory: TaxCategory;
  // ☆ ボタン: その行のメニュー登録モーダルを開く（同期。登録自体はモーダル内のフォームが行う）。
  onRegisterRow: (categoryId: string, index: number) => void;
  // 業販対応 段2-1: 法人時は「単価/業販/参考定価」3列、個人時は「単価」1列に切替。
  isBusiness: boolean;
}) {
  function update(i: number, patch: Partial<ItemRow>) {
    onChange(
      rows.map((r, idx) => {
        if (idx !== i) return r;
        return { ...r, ...patch };
      }),
    );
  }
  // 業販対応 段2-1: 「単価」を直接編集する経路。
  //   labor_cost に新値を書き、parts_cost をクリアし、unit_price も新値に揃える。
  //   こうすることで rowSubtotal = quantity × unit_price がそのまま正しく動く。
  //   ItemRow の labor_cost / parts_cost フィールド名は過去 jsonb 互換のため残置している。
  function updateUnitPrice(i: number, v: string) {
    update(i, {
      labor_cost: v,
      parts_cost: "",
      unit_price: v,
    });
  }
  // 業販対応 段2-1: 「原価」を直接編集する経路。labor_cost_price に新値を書き、
  //   parts_cost_price をクリア。表示時は labor + parts を合算するので過去データも自然に出る。
  function updateCostPrice(i: number, v: string) {
    update(i, {
      labor_cost_price: v,
      parts_cost_price: "",
    });
  }
  // 段階2: 種別（作業/部品）の切替。表示中の名前を新しい種別の名前欄へ移し、もう片方を空にする。
  //   これで「打ち間違えて種別を変えた」ときも入力済みの名前が消えない。
  //   linked_part_id / source_menu_id はここでは触らない（マスター連携・在庫を勝手に壊さない）。
  function changeKind(i: number, kind: ItemKind) {
    const r = rows[i];
    if (!r || r.kind === kind) return;
    if (kind === "part") {
      const name = r.name.trim() !== "" ? r.name : r.part_name;
      update(i, { kind, part_name: name, name: "" });
    } else {
      const name = r.part_name.trim() !== "" ? r.part_name : r.name;
      update(i, { kind, name, part_name: "" });
    }
  }
  // 段階2: 簡易入力の「名前」欄。種別に応じて work_name(name) か part_name のどちらかを編集する。
  function updateName(i: number, v: string) {
    const r = rows[i];
    if (r?.kind === "part") update(i, { part_name: v });
    else update(i, { name: v });
  }
  // 段階2: 「詳細」パネルの開閉。
  function toggleDetail(i: number) {
    update(i, { _detailOpen: !(rows[i]?._detailOpen === true) });
  }
  function add() {
    onChange([...rows, emptyRow(categoryId, defaultTaxCategory)]);
  }
  function remove(i: number) {
    onChange(rows.filter((_, idx) => idx !== i));
  }
  // 補足の展開/折りたたみトグル。展開時は textarea を表示。
  // 折りたたみ時は note と _noteExpanded を同時にクリア（保存時 null として確定）。
  function toggleNote(i: number) {
    onChange(
      rows.map((r, idx) => {
        if (idx !== i) return r;
        const expanded = r.note !== "" || r._noteExpanded === true;
        if (expanded) return { ...r, note: "", _noteExpanded: false };
        return { ...r, _noteExpanded: true };
      }),
    );
  }

  // ── 段階3: 「1行にまとめる」（表示結合） ──────────────────────────────
  // 部品行(kind=part)が parent_uid で作業行(_uid)を指すと、その2行を1行に結合して表示する。
  // データは別行のまま（計算・在庫は不変）。作業1つに結合できる部品は1つだけ。
  //   parentUid -> 結合する子部品行の index（先頭の1つのみ）。
  //   親作業行が実在する場合のみ結合する（親を消した/名前を空にした孤児は単独表示に戻す。
  //   lib/orders/sections.ts の toDisplayUnits と同じ判定にして画面・PDF を一致させる）。
  const uidPresent = new Set<string>();
  for (const r of rows) if (r._uid) uidPresent.add(r._uid);
  const childIndexByParentUid = new Map<string, number>();
  rows.forEach((r, idx) => {
    const p = r.parent_uid;
    if (p && p !== "" && uidPresent.has(p) && !childIndexByParentUid.has(p)) {
      childIndexByParentUid.set(p, idx);
    }
  });
  const childIndices = new Set<number>(childIndexByParentUid.values());

  // 表示単位。single = 単独行、merged = 作業行 + 結合部品行1つ。
  type RenderUnit =
    | { kind: "single"; row: ItemRow; index: number }
    | {
        kind: "merged";
        work: ItemRow;
        workIndex: number;
        part: ItemRow;
        partIndex: number;
      };
  const units: RenderUnit[] = [];
  rows.forEach((r, idx) => {
    if (childIndices.has(idx)) return; // 子は親と一緒に描画するのでスキップ
    const childIdx = r._uid ? childIndexByParentUid.get(r._uid) : undefined;
    const child = childIdx !== undefined ? rows[childIdx] : undefined;
    if (childIdx !== undefined && child) {
      units.push({
        kind: "merged",
        work: r,
        workIndex: idx,
        part: child,
        partIndex: childIdx,
      });
    } else {
      units.push({ kind: "single", row: r, index: idx });
    }
  });
  function unitId(u: RenderUnit): string {
    return u.kind === "merged"
      ? (u.work._uid ?? `idx_${u.workIndex}`)
      : (u.row._uid ?? `idx_${u.index}`);
  }

  // 作業行に空の部品行を1つ付けて「まとめる」。作業行の直後に挿入する。
  function addMergedPart(workIndex: number) {
    const work = rows[workIndex];
    if (!work?._uid) return;
    if (childIndexByParentUid.has(work._uid)) return; // すでに部品あり（作業1+部品1）
    const child: ItemRow = {
      ...emptyRow(work.item_category_id || categoryId, work.tax_category),
      kind: "part",
      parent_uid: work._uid,
    };
    const next = [...rows];
    next.splice(workIndex + 1, 0, child);
    onChange(next);
  }
  // まとめ解除: 子部品行の parent_uid を外して単独行に戻す（データは元から別行なので残る）。
  function unmerge(workUid: string | undefined) {
    if (!workUid) return;
    onChange(
      rows.map((r) => (r.parent_uid === workUid ? { ...r, parent_uid: "" } : r)),
    );
  }
  // 結合ユニットごと削除（作業行＋結合部品行の両方を消す）。
  function removeMerged(workIndex: number, partIndex: number) {
    onChange(rows.filter((_, idx) => idx !== workIndex && idx !== partIndex));
  }

  // カテゴリ内ドラッグ並べ替え（@dnd-kit、部品一覧と同じパターン）。各カテゴリの ItemTableEditor が
  // 独立した DndContext を持つため、ドラッグはこのカテゴリ内に限定される（カテゴリまたぎ不可）。
  // 段階3: 並べ替えは「表示単位（units）」を動かし、結合部品行は親作業行に連れて移動する。
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldI = units.findIndex((u) => unitId(u) === active.id);
    const newI = units.findIndex((u) => unitId(u) === over.id);
    if (oldI < 0 || newI < 0) return;
    const moved = arrayMove(units, oldI, newI);
    const flat: ItemRow[] = [];
    for (const u of moved) {
      if (u.kind === "merged") {
        flat.push(u.work);
        flat.push(u.part);
      } else {
        flat.push(u.row);
      }
    }
    onChange(flat);
  }

  return (
    <div className="space-y-2">
      {rows.length === 0 ? (
        <p className="rounded-md border border-zinc-200 bg-white px-3 py-4 text-center text-xs text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500">
          明細はありません
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={units.map((u) => unitId(u))}
            strategy={verticalListSortingStrategy}
          >
            {units.map((u, uPos) => {
              const id = unitId(u);
              // 表示単位ごとにゼブラ・連番（結合ユニットは1つとして数える）。
              const zebra = uPos % 2 === 1;

              // ── 結合ユニット（作業1＋部品1を1行表示・他店式） ──
              if (u.kind === "merged") {
                const { work, workIndex, part, partIndex } = u;
                const workSub = rowSubtotal(toItem(work, categoryName));
                const partSub = rowSubtotal(toItem(part, categoryName));
                const mergedNoteOpen =
                  work.note !== "" || work._noteExpanded === true;
                const mergedDetailOpen =
                  work._detailOpen === true || mergedNoteOpen;
                return (
                  <SortableItemRow key={id} id={id} zebra={zebra}>
                    {(handle) => (
                      <>
                        {/* 段階3: 結合行（他店式）: [#][作業内容][部品名][工賃][部品代][詳細/×]、小計は下段。
                            作業名・部品名を両方表示する。 */}
                        <div className="wos-item-row grid items-end gap-x-2 gap-y-1 grid-cols-[24px_minmax(0,1fr)_minmax(0,1fr)_60px_60px_auto] sm:grid-cols-[28px_minmax(0,1fr)_minmax(0,1fr)_82px_82px_auto]">
                          <div className="mb-0.5 flex flex-col items-center gap-0.5">
                            <button
                              type="button"
                              aria-label="ドラッグして並べ替え"
                              title="ドラッグで並べ替え（同カテゴリ内）"
                              className="inline-flex h-8 w-6 cursor-grab items-center justify-center rounded bg-zinc-200 text-xs font-medium text-zinc-700 active:cursor-grabbing dark:bg-zinc-700 dark:text-zinc-300"
                              {...handle.attributes}
                              {...handle.listeners}
                            >
                              {uPos + 1}
                            </button>
                            <span
                              className="rounded bg-emerald-100 px-1 text-[9px] font-medium leading-tight text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                              title="作業と部品を1行にまとめて表示しています"
                            >
                              まとめ
                            </span>
                          </div>

                          <div>
                            <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                              作業内容
                            </label>
                            <input
                              value={work.name}
                              onChange={(e) =>
                                updateName(workIndex, e.target.value)
                              }
                              placeholder="作業内容"
                              aria-label="作業内容"
                              className={cellInputClass}
                            />
                          </div>

                          <div>
                            <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                              部品名
                            </label>
                            <input
                              value={part.part_name}
                              onChange={(e) =>
                                updateName(partIndex, e.target.value)
                              }
                              placeholder="部品名"
                              aria-label="部品名"
                              className={cellInputClass}
                            />
                          </div>

                          <div>
                            <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                              工賃
                            </label>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={0}
                              step={1}
                              value={work.unit_price}
                              onChange={(e) =>
                                updateUnitPrice(workIndex, e.target.value)
                              }
                              placeholder="—"
                              aria-label="工賃"
                              className={`${cellInputClass} text-right`}
                            />
                          </div>

                          <div>
                            <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                              部品代
                            </label>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={0}
                              step={1}
                              value={part.unit_price}
                              onChange={(e) =>
                                updateUnitPrice(partIndex, e.target.value)
                              }
                              placeholder="—"
                              aria-label="部品代"
                              className={`${cellInputClass} text-right`}
                            />
                          </div>

                          <div className="flex items-center gap-1 justify-self-end">
                            <button
                              type="button"
                              onClick={() => toggleDetail(workIndex)}
                              aria-expanded={mergedDetailOpen}
                              title="原価・数量・まとめ解除・補足を表示"
                              className={`flex h-9 items-center justify-center gap-0.5 rounded-md border px-2 text-xs font-medium transition-colors ${
                                mergedDetailOpen
                                  ? "border-zinc-400 bg-zinc-100 text-zinc-800 dark:border-zinc-500 dark:bg-zinc-800 dark:text-zinc-100"
                                  : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                              }`}
                            >
                              詳細
                              <span
                                aria-hidden
                                className={mergedDetailOpen ? "rotate-180" : ""}
                              >
                                ▾
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => removeMerged(workIndex, partIndex)}
                              aria-label="この結合行を削除"
                              className="flex h-11 w-11 md:h-9 md:w-9 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-red-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-red-400"
                            >
                              ×
                            </button>
                          </div>
                        </div>

                        {/* 小計（工賃＋部品代の合算・表示のみ）＋業販/定価バッジ */}
                        <div className="mt-0.5 flex items-center justify-end gap-1 pr-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                          <PriceKindBadge isBusiness={isBusiness} />
                          <span>小計 {formatYen(workSub + partSub)}</span>
                        </div>

                        {mergedDetailOpen && (
                          <div className="mt-2 space-y-3 rounded-md border border-dashed border-emerald-300 bg-emerald-50/50 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/20">
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div>
                                <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                                  工賃原価（社内用）
                                </label>
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  min={0}
                                  step={1}
                                  value={
                                    work.labor_cost_price !== ""
                                      ? work.labor_cost_price
                                      : work.parts_cost_price
                                  }
                                  onChange={(e) =>
                                    updateCostPrice(workIndex, e.target.value)
                                  }
                                  placeholder="—"
                                  aria-label="工賃原価（社内管理用）"
                                  className={`${cellInputClass} text-right`}
                                />
                              </div>
                              <div>
                                <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                                  部品原価（社内用）
                                </label>
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  min={0}
                                  step={1}
                                  value={
                                    part.parts_cost_price !== ""
                                      ? part.parts_cost_price
                                      : part.labor_cost_price
                                  }
                                  onChange={(e) =>
                                    updateCostPrice(partIndex, e.target.value)
                                  }
                                  placeholder="—"
                                  aria-label="部品原価（社内管理用）"
                                  className={`${cellInputClass} text-right`}
                                />
                              </div>
                              <div>
                                <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                                  作業数量
                                </label>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  min={0}
                                  step={1}
                                  value={work.quantity}
                                  onChange={(e) =>
                                    update(workIndex, { quantity: e.target.value })
                                  }
                                  aria-label="作業数量"
                                  className={`${cellInputClass} text-center`}
                                />
                              </div>
                              <div>
                                <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                                  部品数量
                                </label>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  min={0}
                                  step={1}
                                  value={part.quantity}
                                  onChange={(e) =>
                                    update(partIndex, { quantity: e.target.value })
                                  }
                                  aria-label="部品数量"
                                  className={`${cellInputClass} text-center`}
                                />
                              </div>
                            </div>
                            <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
                              原価は社内管理用（粗利計算）。見積書・請求書には出ません。
                            </p>
                            <div className="flex flex-wrap items-center gap-3 border-t border-emerald-200 pt-2 dark:border-emerald-900/50">
                              <button
                                type="button"
                                onClick={() => unmerge(work._uid)}
                                className="flex h-8 items-center gap-1 rounded-md border border-zinc-300 bg-white px-2.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                              >
                                🔗 まとめを解除（別行に戻す）
                              </button>
                              <button
                                type="button"
                                onClick={() => onRegisterRow(categoryId, workIndex)}
                                title="この作業を作業メニューマスターに登録"
                                className="flex h-8 items-center gap-1 rounded-md border border-amber-200 bg-white px-2.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-50 dark:border-amber-900 dark:bg-zinc-900 dark:text-amber-400 dark:hover:bg-amber-950"
                              >
                                ☆ この作業をマスター登録
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleNote(workIndex)}
                                className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-50"
                              >
                                {mergedNoteOpen ? "× 補足を閉じる" : "＋ 補足"}
                              </button>
                            </div>
                            {mergedNoteOpen && (
                              <textarea
                                value={work.note}
                                onChange={(e) =>
                                  update(workIndex, { note: e.target.value })
                                }
                                rows={2}
                                placeholder="補足（任意・帳票の品名下に小さく表示されます）"
                                aria-label="補足"
                                className={`${cellInputClass} min-h-12 resize-y`}
                              />
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </SortableItemRow>
                );
              }

              // ── 単独行（段階2の簡易入力＋詳細） ──
              const r = u.row;
              const i = u.index;
              const noteOpen = r.note !== "" || r._noteExpanded === true;
              // 段階2: 「詳細」パネルの開閉。補足に既存の文言がある行は詳細を自動展開して
              //   （内部に補足を内包するため）中身を隠さない。
              const detailOpen = r._detailOpen === true || noteOpen;
              // マスター（メニュー/部品在庫）由来の行は種別が確定しているので種別トグルは不可。
              const isMaster = r.linked_part_id !== "" || r.source_menu_id !== "";
              // 小計・業販表示に使う OrderItem 換算（表示専用。保存とは無関係）。
              const rowItem = toItem(r, categoryName);
              // 段階3: 作業行（labor・マスター由来でない）は「1行にまとめる」を選べる。
              const canMerge = r.kind === "labor";
              return (
                <SortableItemRow key={id} id={id} zebra={zebra}>
                  {(handle) => (
                    <>
              {/* 段階2: 簡易入力行 = [#] [種別] [名前] [数量] [金額+バッジ] [詳細/×]。
                  原価・定価・業販・マスター登録・補足は下の「詳細」パネルに格納し、普段はすっきり保つ。
                  items-end で各セルを下端揃え（ラベル付きセルの入力底辺を一致）。 */}
              <div className="wos-item-row grid items-end gap-x-2 gap-y-1 grid-cols-[24px_72px_minmax(0,1fr)_52px_100px_auto] sm:grid-cols-[28px_84px_minmax(0,1fr)_60px_116px_auto]">
                {/* # バッジ＝ドラッグハンドル。ハンドルだけに listeners を付け、行内 input は掴まず編集可。 */}
                <button
                  type="button"
                  aria-label="ドラッグして並べ替え"
                  title="ドラッグで並べ替え（同カテゴリ内）"
                  className="mb-0.5 inline-flex h-8 w-6 cursor-grab items-center justify-center rounded bg-zinc-200 text-xs font-medium text-zinc-700 active:cursor-grabbing dark:bg-zinc-700 dark:text-zinc-300"
                  {...handle.attributes}
                  {...handle.listeners}
                >
                  {uPos + 1}
                </button>

                {/* 種別（作業/部品）。マスター由来の行は種別が確定なので変更不可。 */}
                <div>
                  <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    種別
                  </label>
                  <select
                    value={r.kind}
                    disabled={isMaster}
                    onChange={(e) => changeKind(i, e.target.value as ItemKind)}
                    aria-label="種別（作業/部品）"
                    title={
                      isMaster
                        ? "マスター（メニュー/部品在庫）から追加した行は種別が確定しています"
                        : "作業か部品かを選びます"
                    }
                    className={`${cellInputClass} disabled:opacity-70`}
                  >
                    <option value="labor">作業</option>
                    <option value="part">部品</option>
                  </select>
                </div>

                {/* 名前（種別に応じて work_name / part_name を編集） */}
                <div>
                  <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    {r.kind === "part" ? "部品名" : "作業内容"}
                  </label>
                  <input
                    value={r.kind === "part" ? r.part_name : r.name}
                    onChange={(e) => updateName(i, e.target.value)}
                    placeholder={r.kind === "part" ? "部品名" : "作業内容"}
                    aria-label={r.kind === "part" ? "部品名" : "作業内容"}
                    className={cellInputClass}
                  />
                </div>

                {/* 数量 */}
                <div>
                  <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    数量
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={1}
                    value={r.quantity}
                    onChange={(e) => update(i, { quantity: e.target.value })}
                    aria-label="数量"
                    className={`${cellInputClass} text-center`}
                  />
                </div>

                {/* 金額（単価）＋業販/定価バッジ */}
                <div>
                  <label className="mb-0.5 flex items-center justify-between gap-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    <span>金額</span>
                    <PriceKindBadge isBusiness={isBusiness} />
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    value={r.unit_price}
                    onChange={(e) => updateUnitPrice(i, e.target.value)}
                    placeholder="—"
                    aria-label="金額（単価）"
                    className={`${cellInputClass} text-right`}
                  />
                </div>

                {/* 操作: 詳細トグル / 行削除 */}
                <div className="flex items-center gap-1 justify-self-end">
                  <button
                    type="button"
                    onClick={() => toggleDetail(i)}
                    aria-expanded={detailOpen}
                    title="原価・定価・業販・マスター登録・補足を表示"
                    className={`flex h-9 items-center justify-center gap-0.5 rounded-md border px-2 text-xs font-medium transition-colors ${
                      detailOpen
                        ? "border-zinc-400 bg-zinc-100 text-zinc-800 dark:border-zinc-500 dark:bg-zinc-800 dark:text-zinc-100"
                        : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    }`}
                  >
                    詳細
                    <span aria-hidden className={detailOpen ? "rotate-180" : ""}>
                      ▾
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    aria-label="行を削除"
                    className="flex h-11 w-11 md:h-9 md:w-9 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-red-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-red-400"
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* 行の小計（右寄せ・控えめ）。合計は下のサマリーに集約。 */}
              <div className="mt-0.5 pr-1 text-right text-[11px] text-zinc-500 dark:text-zinc-400">
                小計 {formatYen(rowSubtotal(rowItem))}
              </div>

              {/* 段階2: 詳細パネル（原価・定価・業販・この行をマスター登録・補足）。
                  税区分はここに出さない（既存の税区分ロジックは維持）。すべて既存フィールドで完結し、
                  金額計算・保存・PDF・在庫連携には影響しない。 */}
              {detailOpen && (
                <div className="mt-2 space-y-3 rounded-md border border-dashed border-zinc-300 bg-zinc-50/70 p-3 dark:border-zinc-700 dark:bg-zinc-900/40">
                  <div className="grid gap-3 sm:grid-cols-3">
                    {/* 原価（社内用・帳票非表示）。labor_cost_price 単独編集、過去の parts_cost_price はフォールバック表示。 */}
                    <div>
                      <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        原価（社内用）
                      </label>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        value={
                          r.labor_cost_price !== ""
                            ? r.labor_cost_price
                            : r.parts_cost_price
                        }
                        onChange={(e) => updateCostPrice(i, e.target.value)}
                        placeholder="—"
                        aria-label="原価（社内管理用）"
                        className={`${cellInputClass} text-right`}
                      />
                      <p className="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">
                        粗利計算用。見積書・請求書には出ません。
                      </p>
                    </div>

                    {/* 定価（1個あたりの参考定価）。法人受注の「参考定価」列・合計に使う。 */}
                    <div>
                      <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        定価
                      </label>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        value={r.list_price}
                        onChange={(e) =>
                          update(i, { list_price: e.target.value })
                        }
                        placeholder="—"
                        aria-label="定価（1個あたり）"
                        className={`${cellInputClass} text-right`}
                      />
                      <p className="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">
                        法人受注の「参考定価」列・合計に使います。
                      </p>
                    </div>

                    {/* 業販（法人=金額が業販価格 / 個人=金額が定価）。金額の編集は上の「金額」欄で行う。 */}
                    <div>
                      <label className="mb-0.5 flex items-center justify-between gap-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        <span>業販</span>
                        <PriceKindBadge isBusiness={isBusiness} />
                      </label>
                      {isBusiness ? (
                        <>
                          <div className="rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-right text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                            {formatYen(rowSubtotal(rowItem))}
                          </div>
                          <p className="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">
                            金額（業販単価）× 数量。単価は上の「金額」で編集します。
                          </p>
                        </>
                      ) : (
                        <p className="rounded-md border border-dashed border-zinc-200 px-2 py-1.5 text-[11px] text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                          この受注は個人（定価）です。「金額」が定価として入っています。
                        </p>
                      )}
                    </div>
                  </div>

                  {/* 段階3: 作業行は「1行にまとめる」で部品を1つ付随して1行表示できる。 */}
                  {canMerge && (
                    <label className="flex min-h-11 items-center gap-2 border-t border-zinc-200 pt-2 text-xs text-zinc-700 dark:border-zinc-800 dark:text-zinc-300 md:min-h-0">
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={() => addMergedPart(i)}
                        className="h-3.5 w-3.5 rounded border-zinc-300 dark:border-zinc-600"
                      />
                      🔗 この作業に部品を1つまとめる（1行表示・他店式）
                    </label>
                  )}

                  {/* この行をマスター登録（既存の☆導線を流用）＋ 補足トグル */}
                  <div className="flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-2 dark:border-zinc-800">
                    <button
                      type="button"
                      onClick={() => onRegisterRow(categoryId, i)}
                      title={
                        r.source_menu_id
                          ? "現在の内容で別のマスターとして登録"
                          : "この行を作業メニューマスターに登録"
                      }
                      className="flex h-8 items-center gap-1 rounded-md border border-amber-200 bg-white px-2.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-50 dark:border-amber-900 dark:bg-zinc-900 dark:text-amber-400 dark:hover:bg-amber-950"
                    >
                      ☆ この行をマスター登録
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleNote(i)}
                      className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-50"
                    >
                      {noteOpen ? "× 補足を閉じる" : "＋ 補足"}
                    </button>
                  </div>

                  {noteOpen && (
                    <textarea
                      value={r.note}
                      onChange={(e) => update(i, { note: e.target.value })}
                      rows={2}
                      placeholder="補足（任意・帳票の品名下に小さく表示されます）"
                      aria-label="補足"
                      className={`${cellInputClass} min-h-12 resize-y`}
                    />
                  )}
                </div>
              )}
                    </>
                  )}
                </SortableItemRow>
              );
            })}
          </SortableContext>
        </DndContext>
      )}
      <button
        type="button"
        onClick={add}
        className="rounded-md border border-dashed border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-700 transition-colors hover:border-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:bg-zinc-800"
      >
        ＋ 明細行を追加
      </button>
    </div>
  );
}

// 明細1行のドラッグ可能ラッパー。外枠 div に setNodeRef/transform を当て、ドラッグハンドル用の
// attributes/listeners は render-prop で # バッジに渡す（行内の input は掴まずに編集できる）。
// zebra と本体の見た目は元の行 div のクラスを踏襲する。
function SortableItemRow({
  id,
  zebra,
  children,
}: {
  id: string;
  zebra: boolean;
  children: (handle: {
    attributes: ReturnType<typeof useSortable>["attributes"];
    listeners: ReturnType<typeof useSortable>["listeners"];
  }) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
    position: isDragging ? "relative" : undefined,
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-md border border-zinc-200 p-2.5 dark:border-zinc-800 ${
        isDragging
          ? "bg-white shadow-md dark:bg-zinc-900"
          : zebra
            ? "bg-zinc-100 dark:bg-zinc-800/60"
            : ""
      }`}
    >
      {children({ attributes, listeners })}
    </div>
  );
}

function Row({
  label,
  value,
  emphasize,
  divider,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  divider?: boolean;
}) {
  const className = emphasize
    ? "border-t border-zinc-200 pt-1.5 text-base font-semibold text-zinc-900 dark:border-zinc-800 dark:text-zinc-50"
    : divider
      ? "border-t border-zinc-200 pt-1.5 text-zinc-700 dark:border-zinc-800 dark:text-zinc-300"
      : "text-zinc-700 dark:text-zinc-300";
  return (
    <div className={`flex items-baseline justify-between ${className}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

// ============================================
// 「📋 作業メニューから追加」モーダル
// ============================================
function normalizeForSearch(s: string): string {
  return s.toLowerCase().normalize("NFKC");
}

// Step 3-2b: 車種照合用の正規化。検索用 normalizeForSearch の強化版で、
// 大文字小文字 + 全角半角(NFKC) に加えて記号(ハイフン/アンダースコア/スラッシュ/
// 空白/ドット類) を除去する。これにより GSXR1000 と GSX-R1000、GSX R1000 を同一視する。
// 漢字/カナ寄せ等の高度なゆれ吸収は今回スコープ外（DECISIONS.md「Step 3」参照）。
function normalizeForVehicleMatch(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\-_/\\.]+/g, "");
}

function menuRowTotal(m: WorkMenuItem): number {
  return m.default_labor_cost > 0 || m.default_parts_cost > 0
    ? m.default_labor_cost + m.default_parts_cost
    : m.default_unit_price;
}

function MenuPickerModal({
  allMenus,
  allCategories,
  onConfirm,
  onClose,
}: {
  allMenus: WorkMenuItem[];
  allCategories: WorkItemCategory[];
  onConfirm: (menus: WorkMenuItem[]) => void;
  onClose: () => void;
}) {
  // フィルタ値: 'all' または item_category_id（uuid）。
  type Filter = "all" | string;
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const categoryNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of allCategories) m.set(c.id, c.name);
    return m;
  }, [allCategories]);

  const filtered = useMemo(() => {
    let list = allMenus;
    if (filter !== "all") {
      list = list.filter((m) => m.item_category_id === filter);
    }
    const q = query.trim();
    if (q) {
      const needle = normalizeForSearch(q);
      list = list.filter((m) =>
        normalizeForSearch(`${m.work_name} ${m.part_name ?? ""}`).includes(
          needle,
        ),
      );
    }
    return list;
  }, [allMenus, filter, query]);

  function togglePick(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirm() {
    const selected = filtered.filter((m) => picked.has(m.id));
    // picker 順序ではなく picked にチェックを入れた順序を尊重したい場合は、
    // チェック時に配列を維持する形に変更する。今はテーブル表示順で OK。
    onConfirm(selected);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            作業メニューから追加
          </h3>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {[
              { value: "all" as Filter, label: "すべて" },
              ...allCategories.map((c) => ({
                value: c.id as Filter,
                label: c.name,
              })),
            ].map(({ value: v, label: l }) => (
              <button
                key={v}
                type="button"
                onClick={() => setFilter(v)}
                className={`rounded-full px-3 py-1 text-xs transition-colors ${
                  filter === v
                    ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                    : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                }`}
              >
                {l}
              </button>
            ))}
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="作業内容・部品名で検索"
              className="ml-auto w-56"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
              {allMenus.length === 0
                ? "作業メニューが未登録です。「作業メニュー」画面で登録してください。"
                : "該当する作業メニューがありません。"}
            </p>
          ) : (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {filtered.map((m) => (
                <li key={m.id} className="px-4 py-2">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={picked.has(m.id)}
                      onChange={() => togglePick(m.id)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="text-sm text-zinc-900 dark:text-zinc-50">
                        {m.work_name}
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">
                        {m.item_category_id
                          ? (categoryNameById.get(m.item_category_id) ??
                            "（不明）")
                          : "（未分類）"}
                        {m.tax_category === "shaken_non_tax" ? "・非課税" : ""}
                        {m.part_name ? ` / ${m.part_name}` : ""}
                      </div>
                    </div>
                    <div className="text-sm text-zinc-700 dark:text-zinc-300">
                      {formatYen(menuRowTotal(m))}
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            選択中: {picked.size} 件
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              キャンセル
            </button>
            <button
              type="button"
              disabled={picked.size === 0}
              onClick={confirm}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              明細に追加
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// 「🔩 部品在庫から追加」モーダル
// ============================================
// 表示対象は親（受注詳細ページ）で deleted_at IS NULL かつ show_in_detail = true に
// 絞った allParts。間接材料（show_in_detail=false）はここには出さず従来通りメニュー経由。
function PartPickerModal({
  allParts,
  allVariants,
  vehicle,
  isBusiness,
  onConfirm,
  onClose,
}: {
  allParts: PartsInventory[];
  allVariants: PartsInventoryVariant[];
  vehicle: Vehicle | null;
  // 業販対応 第二歩-2a: 法人時のみ variant の markup_rate を反映した「業販 ¥」を表示する。
  isBusiness: boolean;
  onConfirm: (
    parts: PartsInventory[],
    matchedByPart: Map<string, PartsInventoryVariant>,
  ) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return allParts;
    const needle = normalizeForSearch(q);
    return allParts.filter((p) =>
      normalizeForSearch(
        `${p.name} ${p.internal_code ?? ""} ${p.external_code ?? ""}`,
      ).includes(needle),
    );
  }, [allParts, query]);

  // 二階建て化（2026-06-24）: 車種一致（タグあり）を全走査で先に確定し、
  // 一致が無い部品だけ「標準（汎用＝車種空）」をフォールバックに使う二段構え。
  //   - vehicleMatchByPart: 車種一致のみ（⭐バッジ・「車種別」表示の根拠）
  //   - generalByPart:      標準（車種空）の代表1件（display_order 最小＝先頭）
  //   - effectiveByPart:    実際に明細へ流す variant＝車種一致 ?? 標準
  // 標準は display_order が先頭になりやすいので、車種一致とは別々に集めて
  // 「車種一致を全部見てから、無いときだけ標準」を保証する（標準を先に拾う事故を防ぐ）。
  const vehicleMatchByPart = useMemo(() => {
    const map = new Map<string, PartsInventoryVariant>();
    const target = normalizeForVehicleMatch(vehicle?.model ?? "");
    if (!target) return map;
    for (const v of allVariants) {
      if (v.vehicle_tags.length === 0) continue; // 標準は車種一致の対象外
      if (map.has(v.part_id)) continue;
      const hit = v.vehicle_tags.some(
        (t) => normalizeForVehicleMatch(t) === target,
      );
      if (hit) map.set(v.part_id, v);
    }
    return map;
  }, [allVariants, vehicle?.model]);

  const generalByPart = useMemo(() => {
    const map = new Map<string, PartsInventoryVariant>();
    for (const v of allVariants) {
      if (v.vehicle_tags.length !== 0) continue; // 標準（車種空）のみ
      if (map.has(v.part_id)) continue; // 先頭（display_order 最小）を採用
      map.set(v.part_id, v);
    }
    return map;
  }, [allVariants]);

  const effectiveByPart = useMemo(() => {
    const map = new Map<string, PartsInventoryVariant>(generalByPart);
    for (const [pid, v] of vehicleMatchByPart) map.set(pid, v);
    return map;
  }, [generalByPart, vehicleMatchByPart]);

  function togglePick(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirm() {
    onConfirm(
      filtered.filter((p) => picked.has(p.id)),
      effectiveByPart,
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            部品在庫から追加
          </h3>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="部品名・社内品番・社外品番で検索"
              className="ml-auto w-64"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
              {allParts.length === 0
                ? "明細に出せる部品が未登録です。「部品在庫」画面で登録してください。"
                : "該当する部品がありません。"}
            </p>
          ) : (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {filtered.map((p) => {
                const available =
                  Number(p.stock_quantity ?? 0) -
                  Number(p.reserved_quantity ?? 0);
                const outOfStock = available <= 0;
                const codes = [p.internal_code, p.external_code]
                  .filter((c) => c && c.trim() !== "")
                  .join(" / ");
                // 二階建て化（2026-06-24）: ⭐は車種一致のときだけ。価格は「車種一致 ?? 標準」の
                // effective variant の定価で表示する。法人かつ掛率があれば業販を主表示にする。
                const matched = vehicleMatchByPart.get(p.id) ?? null; // 車種一致のみ（⭐用）
                const effective = matched ?? generalByPart.get(p.id) ?? null;
                const effectivePrice = effective?.list_price ?? null;
                const hasEffectivePrice = effectivePrice != null;
                const effectiveRate = effective?.markup_rate;
                const showBulkPrice =
                  isBusiness &&
                  hasEffectivePrice &&
                  effectiveRate != null &&
                  Number.isFinite(effectiveRate);
                const bulkPrice = showBulkPrice
                  ? Math.round(effectivePrice! * effectiveRate!)
                  : null;
                return (
                  <li key={p.id} className="px-4 py-2">
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={picked.has(p.id)}
                        onChange={() => togglePick(p.id)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 text-sm text-zinc-900 dark:text-zinc-50">
                          {matched && (
                            <span
                              aria-label="車種一致"
                              title={`${vehicle?.model ?? ""} に合致する組があります`}
                            >
                              ⭐
                            </span>
                          )}
                          <span>{p.name}</span>
                        </div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400">
                          {codes ? `${codes}・` : ""}
                          利用可能 {available}
                          {p.unit ? p.unit : ""}
                          {outOfStock && (
                            <span className="ml-1.5 font-medium text-amber-700 dark:text-amber-300">
                              ⚠️ 在庫切れ（マイナス許容）
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right text-sm text-zinc-700 dark:text-zinc-300">
                        {showBulkPrice ? (
                          <>
                            <div className="font-medium text-zinc-900 dark:text-zinc-50">
                              業販 {formatYen(bulkPrice!)}
                            </div>
                            <div className="text-xs text-zinc-400 dark:text-zinc-500">
                              定価 {formatYen(effectivePrice!)}
                            </div>
                          </>
                        ) : hasEffectivePrice ? (
                          <div className="font-medium text-zinc-900 dark:text-zinc-50">
                            {matched ? "車種別 " : ""}
                            {formatYen(effectivePrice!)}
                          </div>
                        ) : p.sale_price != null ? (
                          formatYen(p.sale_price)
                        ) : (
                          "売価なし"
                        )}
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            選択中: {picked.size} 件
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              キャンセル
            </button>
            <button
              type="button"
              disabled={picked.size === 0}
              onClick={confirm}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              明細に追加
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// 「📦 作業セットから追加」モーダル
// ============================================
function SetPickerModal({
  sets,
  allCategories,
  onConfirm,
  onClose,
}: {
  sets: SetWithItems[];
  allCategories: WorkItemCategory[];
  onConfirm: (set: SetWithItems) => void;
  onClose: () => void;
}) {
  const [pickedId, setPickedId] = useState<string | null>(null);
  const picked = useMemo(
    () => sets.find((s) => s.set.id === pickedId) ?? null,
    [sets, pickedId],
  );
  const categoryNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of allCategories) m.set(c.id, c.name);
    return m;
  }, [allCategories]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
            作業セットから追加
          </h3>
        </div>

        <div className="flex-1 overflow-y-auto">
          {sets.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
              作業セットが未登録です。「作業セット」画面で登録してください。
            </p>
          ) : (
            <div className="grid gap-0 sm:grid-cols-[1fr_1.4fr]">
              {/* 左: セット一覧 */}
              <ul className="divide-y divide-zinc-200 border-r border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                {sets.map((s) => {
                  const total = s.items.reduce(
                    (sum, x) => sum + menuRowTotal(x.menu),
                    0,
                  );
                  const partCount = s.parts?.length ?? 0;
                  const active = pickedId === s.set.id;
                  return (
                    <li key={s.set.id}>
                      <button
                        type="button"
                        onClick={() => setPickedId(s.set.id)}
                        className={`block w-full px-4 py-2.5 text-left text-sm transition-colors ${
                          active
                            ? "bg-zinc-100 dark:bg-zinc-800"
                            : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                        }`}
                      >
                        <div className="font-medium text-zinc-900 dark:text-zinc-50">
                          {s.set.name}
                        </div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400">
                          メニュー {s.items.length} 件
                          {partCount > 0 ? ` / 部品 ${partCount} 件` : ""} / 合計{" "}
                          {formatYen(total)}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>

              {/* 右: 中身プレビュー（メニュー＋部品） */}
              <div className="p-4">
                {!picked ? (
                  <p className="px-2 py-4 text-sm text-zinc-500 dark:text-zinc-400">
                    左のセットを選ぶと、含まれるメニューと部品が表示されます。
                  </p>
                ) : picked.items.length === 0 &&
                  (picked.parts?.length ?? 0) === 0 ? (
                  <p className="px-2 py-4 text-sm text-zinc-500 dark:text-zinc-400">
                    （中身なし）
                  </p>
                ) : (
                  <div className="space-y-3">
                    {picked.items.length > 0 && (
                      <ol className="space-y-1.5 text-sm">
                        {picked.items.map((x, idx) => (
                          <li
                            key={`${x.menu.id}-${idx}`}
                            className="flex items-start justify-between gap-3"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-zinc-900 dark:text-zinc-50">
                                {x.menu.work_name}
                              </div>
                              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                                {x.menu.item_category_id
                                  ? (categoryNameById.get(
                                      x.menu.item_category_id,
                                    ) ?? "（不明）")
                                  : "（未分類）"}
                                {x.menu.tax_category === "shaken_non_tax"
                                  ? "・非課税"
                                  : ""}
                                {x.menu.part_name ? ` / ${x.menu.part_name}` : ""}
                              </div>
                            </div>
                            <div className="text-zinc-700 dark:text-zinc-300">
                              {formatYen(menuRowTotal(x.menu))}
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                    {(picked.parts?.length ?? 0) > 0 && (
                      <div>
                        <div className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-400">
                          部品
                        </div>
                        <ol className="space-y-1.5 text-sm">
                          {picked.parts!.map((x, idx) => (
                            <li
                              key={`${x.part.id}-${idx}`}
                              className="flex items-start justify-between gap-3"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-zinc-900 dark:text-zinc-50">
                                  🔩 {x.part.name}
                                  {x.quantity > 1 ? ` ×${x.quantity}` : ""}
                                </div>
                                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                                  価格は車両に合わせて計算
                                </div>
                              </div>
                              <div className="text-zinc-500 dark:text-zinc-400">
                                {x.part.sale_price != null
                                  ? formatYen(x.part.sale_price)
                                  : "—"}
                              </div>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            キャンセル
          </button>
          <button
            type="button"
            disabled={
              !picked ||
              (picked.items.length === 0 && (picked.parts?.length ?? 0) === 0)
            }
            onClick={() => picked && onConfirm(picked)}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            明細に追加
          </button>
        </div>
      </div>
    </div>
  );
}
