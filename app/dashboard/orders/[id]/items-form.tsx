"use client";

import Link from "next/link";
import { useActionState, useMemo, useState, useTransition } from "react";
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
import { registerOrderItemAsMenu } from "../../work-menus/actions";
import type { FolderActionResult, FormState } from "../actions";

type SetWithItems = {
  set: WorkMenuSet;
  items: { menu: WorkMenuItem; position: number }[];
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
  };
}

type ItemRow = {
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
  // UI 専用: 「+ 補足」ボタンで明示的に展開した行で true。
  // note に値がある行は自動展開なのでこのフラグを見ない。保存対象外。
  _noteExpanded?: boolean;
};

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
  return {
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

  // 初期 state: 既存 items を category id 単位の Record に振り分ける。
  // カテゴリ未登録（極端なケース）でも壊れないようフォールバック空オブジェクトで初期化。
  const [rowsByCat, setRowsByCat] = useState<Record<string, ItemRow[]>>(() => {
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
    const rows = set.items.map((x) => {
      const row = rowFromMenu(x.menu, indirectByMenu, isBusiness);
      if (!row.item_category_id) row.item_category_id = fallbackId;
      return row;
    });
    addRowsByCategory(rows);
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

  // 行の ☆ ボタン: その行をマスター（work_menu_items）に登録する。
  // 登録成功時は当該 row.source_menu_id を新規 id でセットして二重登録を抑止する。
  const [registeringRow, setRegisteringRow] = useState<{
    categoryId: string;
    index: number;
  } | null>(null);
  function handleRegisterRow(
    categoryId: string,
    index: number,
  ): Promise<void> {
    const list = rowsByCat[categoryId] ?? [];
    const r = list[index];
    if (!r) return Promise.resolve();
    if (!r.name.trim()) {
      alert("作業内容が空のため登録できません。");
      return Promise.resolve();
    }
    if (!r.item_category_id) {
      alert("業務カテゴリが未設定のため登録できません。");
      return Promise.resolve();
    }
    if (
      !confirm(
        `「${r.name}」を作業メニューマスターに登録しますか？\n（補足は登録されません）`,
      )
    ) {
      return Promise.resolve();
    }
    const categoryName = categoryNameById.get(r.item_category_id) ?? null;
    const item = toItem(r, categoryName);
    setRegisteringRow({ categoryId, index });
    return registerOrderItemAsMenu({
      work_name: item.work_name,
      part_name: item.part_name ?? null,
      default_quantity: item.quantity,
      default_unit_price: item.unit_price,
      default_labor_cost: item.labor_cost ?? 0,
      default_parts_cost: item.parts_cost ?? 0,
      labor_cost_price: item.labor_cost_price ?? 0,
      parts_cost_price: item.parts_cost_price ?? 0,
      tax_category: r.tax_category,
      item_category_id: r.item_category_id,
      // 明細がリンクを持っていればマスター側にも引き継ぐ。
      linked_part_id: r.linked_part_id !== "" ? r.linked_part_id : null,
    })
      .then((res) => {
        if ("error" in res) {
          alert(res.error);
          return;
        }
        setRowsByCat((prev) => {
          const cur = prev[categoryId] ?? [];
          return {
            ...prev,
            [categoryId]: cur.map((row, idx) =>
              idx === index ? { ...row, source_menu_id: res.id } : row,
            ),
          };
        });
      })
      .finally(() => setRegisteringRow(null));
  }

  // 全セクションの item 配列を組み立てて totals 計算 & 保存 JSON を作る。
  // 並び順は sectionOrder で確定（display_order 昇順 + orphan 末尾）。
  const allItems: OrderItem[] = useMemo(() => {
    const out: OrderItem[] = [];
    for (const catId of sectionOrder) {
      const list = rowsByCat[catId] ?? [];
      const name = categoryNameById.get(catId) ?? null;
      for (const r of list) out.push(toItem(r, name));
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
              onRegisterRow={handleRegisterRow}
              registeringRow={registeringRow}
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
    </form>
  );
}

function ItemTableEditor({
  rows,
  onChange,
  categoryId,
  categoryName,
  defaultTaxCategory,
  onRegisterRow,
  registeringRow,
  isBusiness,
}: {
  rows: ItemRow[];
  onChange: (rows: ItemRow[]) => void;
  categoryId: string;
  // 小計計算 (toItem) 内で旧 type/tax_free を派生するために必要。
  categoryName: string | null;
  // セクションの推奨税区分。「+ 明細行を追加」で空行を作るときに使う。
  defaultTaxCategory: TaxCategory;
  onRegisterRow: (categoryId: string, index: number) => Promise<void>;
  registeringRow: { categoryId: string; index: number } | null;
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

  return (
    <div className="space-y-2">
      {rows.length === 0 ? (
        <p className="rounded-md border border-zinc-200 bg-white px-3 py-4 text-center text-xs text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500">
          明細はありません
        </p>
      ) : (
        rows.map((r, i) => {
          // 部品在庫から追加した行（部品リンクあり・作業内容空）。種別バッジ表示に使う。
          const isPartRow = r.linked_part_id !== "" && r.name.trim() === "";
          // 偶数行（i=1,3,5...）にゼブラ背景。
          const zebra =
            i % 2 === 1 ? "bg-zinc-100 dark:bg-zinc-800/60" : "";
          const noteOpen = r.note !== "" || r._noteExpanded === true;
          return (
            <div
              key={i}
              className={`rounded-md border border-zinc-200 p-2.5 dark:border-zinc-800 ${zebra}`}
            >
              {/* 2 段グリッド: [#] [作業/工賃] [部品名/部品代] [数量/—] [単価/小計] [☆/×]
                  items-end で各セルを下端揃え（ラベル付きセルと入力単独セルの底辺を一致）。
                  # バッジは row-span-2 + self-center で縦方向中央。 */}
              {/* 最終列（☆ / ×）はモバイルは 36px のアイコン幅のまま（横スクロール防止）、
                  sm 以上では auto にして「☆ メニュー登録」ラベル分だけ広げる。 */}
              <div className="grid items-end gap-x-2 gap-y-1.5 grid-cols-[28px_minmax(0,1fr)_minmax(0,1fr)_70px_90px_36px] sm:grid-cols-[28px_minmax(0,1fr)_minmax(0,1fr)_70px_90px_auto]">
                <div className="row-span-2 flex flex-col items-center justify-center gap-1 self-center">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-zinc-200 text-xs font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300">
                    {i + 1}
                  </span>
                  {isPartRow && (
                    <span
                      className="rounded bg-sky-100 px-1 py-0.5 text-[9px] font-medium leading-tight text-sky-700 dark:bg-sky-950/60 dark:text-sky-300"
                      title="部品在庫から追加した行（部品マスターにリンク）"
                    >
                      部品
                    </span>
                  )}
                </div>

                {/* 列2 上: 作業内容 */}
                <input
                  value={r.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  placeholder="作業内容"
                  aria-label="作業内容"
                  className={cellInputClass}
                />

                {/* 列3 上: 部品名 */}
                <input
                  value={r.part_name}
                  onChange={(e) =>
                    update(i, { part_name: e.target.value })
                  }
                  placeholder="部品名（任意）"
                  aria-label="部品名"
                  className={cellInputClass}
                />

                {/* 列4 上: 数量（ラベル上） */}
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
                    onChange={(e) =>
                      update(i, { quantity: e.target.value })
                    }
                    aria-label="数量"
                    className={`${cellInputClass} text-center`}
                  />
                </div>

                {/* 列5 上: 単価 (段2-1: 常時編集可能。1個あたりの売値=業販単価) */}
                <div>
                  <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    単価
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    value={r.unit_price}
                    onChange={(e) => updateUnitPrice(i, e.target.value)}
                    placeholder="—"
                    aria-label="単価"
                    className={`${cellInputClass} text-right`}
                  />
                </div>

                {/* 列6 上: ☆ ボタン */}
                <button
                  type="button"
                  onClick={() => onRegisterRow(categoryId, i)}
                  disabled={
                    registeringRow?.categoryId === categoryId &&
                    registeringRow?.index === i
                  }
                  aria-label="この行をマスターに登録"
                  title={
                    r.source_menu_id
                      ? "現在の内容で別のマスターとして登録"
                      : "マスターに登録"
                  }
                  className="flex h-9 w-9 items-center justify-center gap-1 rounded-md border border-amber-200 bg-white text-sm text-amber-700 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:px-2.5 dark:border-amber-900 dark:bg-zinc-900 dark:text-amber-400 dark:hover:bg-amber-950"
                >
                  ☆
                  <span className="hidden whitespace-nowrap text-xs font-medium sm:inline">
                    メニュー登録
                  </span>
                </button>

                {/* 列2 下: 原価 (段2-1: 1欄に統合。labor_cost_price 単独で編集、過去データの
                    parts_cost_price は読み取り時のみフォールバック表示) */}
                <div className="flex items-center gap-2">
                  <span
                    className="w-9 shrink-0 text-[10px] text-zinc-400 dark:text-zinc-500"
                    title="社内管理用（粗利計算）。PDF・印刷物には出ません。"
                  >
                    原価
                  </span>
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
                    title="社内管理用（粗利計算）。PDF・印刷物には出ません。"
                    className={`${cellInputClass} text-right text-[12px] text-zinc-600 dark:text-zinc-400`}
                  />
                </div>

                {/* 列3 下: 業販 (法人時のみ表示・readonly。行の業販合計＝小計と同じ値) */}
                {isBusiness ? (
                  <div>
                    <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      業販
                    </div>
                    <div className="px-2 py-1.5 text-right text-sm text-zinc-700 dark:text-zinc-300">
                      {formatYen(rowSubtotal(toItem(r, categoryName)))}
                    </div>
                  </div>
                ) : (
                  <div aria-hidden />
                )}

                {/* 列4 下: 参考定価 (法人時のみ表示・readonly。list_price × quantity)
                    list_price 未保存（過去明細など）の行は「—」表示 */}
                {isBusiness ? (
                  <div>
                    <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      参考定価
                    </div>
                    <div className="px-2 py-1.5 text-right text-sm text-zinc-500 dark:text-zinc-400">
                      {(() => {
                        const lp = Number(r.list_price);
                        const qty = Number(r.quantity);
                        if (
                          !Number.isFinite(lp) ||
                          lp <= 0 ||
                          !Number.isFinite(qty) ||
                          qty <= 0
                        ) {
                          return "—";
                        }
                        return formatYen(Math.round(qty * lp));
                      })()}
                    </div>
                  </div>
                ) : (
                  <div aria-hidden />
                )}

                {/* 列5 下: 小計（ラベル上 / 値表示） */}
                <div>
                  <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    小計
                  </div>
                  <div className="px-2 py-1.5 text-right text-sm font-bold text-zinc-900 dark:text-zinc-50">
                    {formatYen(rowSubtotal(toItem(r, categoryName)))}
                  </div>
                </div>

                {/* 列6 下: × ボタン */}
                <button
                  type="button"
                  onClick={() => remove(i)}
                  aria-label="行を削除"
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-red-700 sm:justify-self-end dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-red-400"
                >
                  ×
                </button>
              </div>

              {/* 補足（折りたたみ）: グリッド外 / # 列幅 + gap = 36px インデント */}
              <div className="mt-1.5 pl-9">
                {noteOpen ? (
                  <div className="space-y-1">
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => toggleNote(i)}
                        className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-50"
                      >
                        × 補足を閉じる
                      </button>
                    </div>
                    <textarea
                      value={r.note}
                      onChange={(e) =>
                        update(i, { note: e.target.value })
                      }
                      rows={2}
                      placeholder="補足（任意）"
                      aria-label="補足"
                      className={`${cellInputClass} min-h-12 resize-y`}
                    />
                  </div>
                ) : (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => toggleNote(i)}
                      className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-50"
                    >
                      ＋ 補足
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })
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
                          {s.items.length} 件 / 合計 {formatYen(total)}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>

              {/* 右: 中身プレビュー */}
              <div className="p-4">
                {!picked ? (
                  <p className="px-2 py-4 text-sm text-zinc-500 dark:text-zinc-400">
                    左のセットを選ぶと、含まれるメニューが表示されます。
                  </p>
                ) : picked.items.length === 0 ? (
                  <p className="px-2 py-4 text-sm text-zinc-500 dark:text-zinc-400">
                    （メニュー未登録）
                  </p>
                ) : (
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
                              ? (categoryNameById.get(x.menu.item_category_id) ??
                                "（不明）")
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
            disabled={!picked || picked.items.length === 0}
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
