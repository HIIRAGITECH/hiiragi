"use client";

import { useActionState, useMemo, useState } from "react";
import type {
  OrderItem,
  WorkCategory,
  WorkMenuItem,
  WorkMenuSet,
} from "@/lib/types";
import { calculateTotals, rowSubtotal } from "@/lib/orders/totals";
import { formatYen } from "@/lib/format";
import SearchInput from "@/lib/components/search-input";
import { registerOrderItemAsMenu } from "../../work-menus/actions";
import type { FormState } from "../actions";

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
  // 「メニューから追加」「セットから追加」picker 用のマスター一覧
  allMenus: WorkMenuItem[];
  allSetsWithItems: SetWithItems[];
};

// セクション識別子（明細を 3 セクションに振り分けるための型）
type Section = "normal" | "shakenTaxable" | "shakenTaxFree";

const SECTION_OF_CATEGORY: Record<WorkCategory, Section> = {
  normal: "normal",
  shaken: "shakenTaxable",
  shaken_tax_free: "shakenTaxFree",
};

const CATEGORY_OF_SECTION: Record<Section, WorkCategory> = {
  normal: "normal",
  shakenTaxable: "shaken",
  shakenTaxFree: "shaken_tax_free",
};

// マスターのデフォルト値から ItemRow を作る
function rowFromMenu(m: WorkMenuItem): ItemRow {
  const labor = m.default_labor_cost > 0 ? String(m.default_labor_cost) : "";
  const parts = m.default_parts_cost > 0 ? String(m.default_parts_cost) : "";
  return {
    name: m.work_name,
    part_name: m.part_name ?? "",
    note: "",
    quantity: String(m.default_quantity ?? 1),
    labor_cost: labor,
    parts_cost: parts,
    unit_price:
      labor !== "" || parts !== ""
        ? String((Number(labor) || 0) + (Number(parts) || 0))
        : String(m.default_unit_price ?? 0),
    source_menu_id: m.id,
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
  // 作業メニューマスターから挿入された場合のみセット。null/空文字は手入力扱い。
  source_menu_id: string;
};

// 工賃 / 部品代の少なくとも片方に値が入っているか（= 単価が自動計算モード）
function hasBreakdown(r: ItemRow): boolean {
  return r.labor_cost !== "" || r.parts_cost !== "";
}

function toRow(i: OrderItem): ItemRow {
  return {
    name: i.work_name,
    part_name: i.part_name ?? "",
    note: i.note ?? "",
    quantity: String(i.quantity),
    labor_cost: i.labor_cost !== undefined ? String(i.labor_cost) : "",
    parts_cost: i.parts_cost !== undefined ? String(i.parts_cost) : "",
    unit_price: String(i.unit_price),
    source_menu_id: i.source_menu_id ?? "",
  };
}

function toItem(r: ItemRow): OrderItem {
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
  return base;
}

const emptyRow = (): ItemRow => ({
  name: "",
  part_name: "",
  note: "",
  quantity: "1",
  labor_cost: "",
  parts_cost: "",
  unit_price: "0",
  source_menu_id: "",
});

// 既存 items を 3 セクションに振り分ける（type / tax_free による）
function splitInitial(items: OrderItem[]): {
  normal: ItemRow[];
  shakenTaxable: ItemRow[];
  shakenTaxFree: ItemRow[];
} {
  const normal: ItemRow[] = [];
  const shakenTaxable: ItemRow[] = [];
  const shakenTaxFree: ItemRow[] = [];
  for (const it of items) {
    const r = toRow(it);
    if (it.type === "shaken") {
      if (it.tax_free) shakenTaxFree.push(r);
      else shakenTaxable.push(r);
    } else {
      normal.push(r);
    }
  }
  return { normal, shakenTaxable, shakenTaxFree };
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
  allMenus,
  allSetsWithItems,
}: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    undefined,
  );

  // useState 初期値は初回 render でのみ使われるため、useMemo 不要
  const split = splitInitial(initialItems);

  const [normalRows, setNormalRows] = useState<ItemRow[]>(
    split.normal.length > 0
      ? split.normal
      : [emptyRow()],
  );
  const [shakenTaxableRows, setShakenTaxableRows] = useState<ItemRow[]>(
    split.shakenTaxable,
  );
  const [shakenTaxFreeRows, setShakenTaxFreeRows] = useState<ItemRow[]>(
    split.shakenTaxFree,
  );
  const [shakenOpen, setShakenOpen] = useState(
    split.shakenTaxable.length + split.shakenTaxFree.length > 0,
  );
  const [discount, setDiscount] = useState(String(initialDiscount));
  const [deposit, setDeposit] = useState(String(initialDeposit));
  const [estimateNotes, setEstimateNotes] = useState(
    initialEstimateNotes ?? "",
  );
  const [invoiceNotes, setInvoiceNotes] = useState(initialInvoiceNotes ?? "");
  const [photoFolderUrl, setPhotoFolderUrl] = useState(
    initialPhotoFolderUrl ?? "",
  );

  // ピッカーモーダルの開閉
  const [menuPickerOpen, setMenuPickerOpen] = useState(false);
  const [setPickerOpen, setSetPickerOpen] = useState(false);

  // セクション → state setter の対応
  const setterOf: Record<Section, (rows: ItemRow[]) => void> = {
    normal: setNormalRows,
    shakenTaxable: setShakenTaxableRows,
    shakenTaxFree: setShakenTaxFreeRows,
  };
  const rowsOf: Record<Section, ItemRow[]> = {
    normal: normalRows,
    shakenTaxable: shakenTaxableRows,
    shakenTaxFree: shakenTaxFreeRows,
  };

  // 一括追加: 各 ItemRow を category 由来の section に振り分けて末尾に追加。
  // shaken 系を追加した場合は車検費用エリアを開いておく。
  function addRowsBySection(rows: { row: ItemRow; section: Section }[]) {
    const buckets: Record<Section, ItemRow[]> = {
      normal: [...normalRows],
      shakenTaxable: [...shakenTaxableRows],
      shakenTaxFree: [...shakenTaxFreeRows],
    };

    // normal セクションは初期に空 1 行が居る場合があるので、最初の挿入で
    // 「未入力の空行」を吸収する（先頭が完全に空ならそれを置き換える）。
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

    let touchedShaken = false;
    for (const { row, section } of rows) {
      if (section !== "normal") touchedShaken = true;
      const list = buckets[section];
      if (list.length === 1 && isEmptyRow(list[0])) {
        buckets[section] = [row];
      } else {
        buckets[section] = [...list, row];
      }
    }

    setNormalRows(buckets.normal);
    setShakenTaxableRows(buckets.shakenTaxable);
    setShakenTaxFreeRows(buckets.shakenTaxFree);
    if (touchedShaken && !shakenOpen) setShakenOpen(true);
  }

  function handleMenuPickerConfirm(menus: WorkMenuItem[]) {
    addRowsBySection(
      menus.map((m) => ({
        row: rowFromMenu(m),
        section: SECTION_OF_CATEGORY[m.category],
      })),
    );
    setMenuPickerOpen(false);
  }

  function handleSetPickerConfirm(set: SetWithItems) {
    addRowsBySection(
      set.items.map((x) => ({
        row: rowFromMenu(x.menu),
        section: SECTION_OF_CATEGORY[x.menu.category],
      })),
    );
    setSetPickerOpen(false);
  }

  // 行の ☆ ボタン: その行をマスター（work_menu_items）に登録する。
  // 登録成功時は当該 row.source_menu_id を新規 id でセットして二重登録を抑止する。
  const [registeringRow, setRegisteringRow] = useState<{
    section: Section;
    index: number;
  } | null>(null);
  function handleRegisterRow(
    section: Section,
    index: number,
  ): Promise<void> {
    const r = rowsOf[section][index];
    if (!r.name.trim()) {
      alert("作業内容が空のため登録できません。");
      return Promise.resolve();
    }
    if (
      !confirm(
        `「${r.name}」を作業メニューマスターに登録しますか？\n（補足は登録されません）`,
      )
    ) {
      return Promise.resolve();
    }
    const item = toItem(r);
    setRegisteringRow({ section, index });
    return registerOrderItemAsMenu({
      work_name: item.work_name,
      part_name: item.part_name ?? null,
      category: CATEGORY_OF_SECTION[section],
      default_quantity: item.quantity,
      default_unit_price: item.unit_price,
      default_labor_cost: item.labor_cost ?? 0,
      default_parts_cost: item.parts_cost ?? 0,
      tax_free: section === "shakenTaxFree",
    })
      .then((res) => {
        if ("error" in res) {
          alert(res.error);
          return;
        }
        // ローカル row の source_menu_id を更新（同一 section 内）
        const list = rowsOf[section];
        setterOf[section](
          list.map((row, idx) =>
            idx === index ? { ...row, source_menu_id: res.id } : row,
          ),
        );
      })
      .finally(() => setRegisteringRow(null));
  }

  // 全セクションの item 配列を組み立てて totals 計算。保存用 JSON もここから作る。
  const allItems: OrderItem[] = [
    ...normalRows.map((r) => toItem(r)),
    ...shakenTaxableRows.map((r) => ({
      ...toItem(r),
      type: "shaken" as const,
    })),
    ...shakenTaxFreeRows.map((r) => ({
      ...toItem(r),
      type: "shaken" as const,
      tax_free: true,
    })),
  ];

  const totals = calculateTotals(
    allItems,
    Number(discount) || 0,
    Number(deposit) || 0,
  );

  const itemsToSave = allItems.filter((i) => i.work_name.trim() !== "");

  const shakenFilledCount =
    shakenTaxableRows.filter((r) => r.name.trim() !== "").length +
    shakenTaxFreeRows.filter((r) => r.name.trim() !== "").length;

  function openShaken() {
    setShakenOpen(true);
    // 初回展開時は各サブセクションに空行を1つ用意しておく
    if (shakenTaxableRows.length === 0) {
      setShakenTaxableRows([emptyRow()]);
    }
    if (shakenTaxFreeRows.length === 0) {
      setShakenTaxFreeRows([emptyRow()]);
    }
  }

  return (
    <form action={formAction} className="space-y-6">
      <input
        type="hidden"
        name="items_json"
        value={JSON.stringify(itemsToSave)}
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

      {/* 通常明細 */}
      <section>
        <ItemTableEditor
          rows={normalRows}
          onChange={setNormalRows}
          section="normal"
          onRegisterRow={handleRegisterRow}
          registeringRow={registeringRow}
        />
      </section>

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
          <p className="ml-1 self-center text-xs text-zinc-500 dark:text-zinc-400">
            選択した項目は category に応じて整備 / 車検（課税）/ 車検（非課税）に振り分けられます。
          </p>
        </div>
      </section>

      {/* 車検費用セクション */}
      <section>
        {!shakenOpen ? (
          <button
            type="button"
            onClick={openShaken}
            className="w-full rounded-md border border-dashed border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-700 transition-colors hover:border-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:bg-zinc-800"
          >
            ＋ 車検費用を追加
            {shakenFilledCount > 0 && `（入力済み ${shakenFilledCount} 件）`}
          </button>
        ) : (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                車検費用
              </h3>
              <button
                type="button"
                onClick={() => setShakenOpen(false)}
                className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-50"
              >
                閉じる
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <h4 className="mb-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  課税分（消費税10%）
                </h4>
                <ItemTableEditor
                  rows={shakenTaxableRows}
                  onChange={setShakenTaxableRows}
                  section="shakenTaxable"
                  onRegisterRow={handleRegisterRow}
                  registeringRow={registeringRow}
                />
              </div>
              <div>
                <h4 className="mb-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  非課税分（自賠責・重量税・印紙代など）
                </h4>
                <ItemTableEditor
                  rows={shakenTaxFreeRows}
                  onChange={setShakenTaxFreeRows}
                  section="shakenTaxFree"
                  onRegisterRow={handleRegisterRow}
                  registeringRow={registeringRow}
                />
              </div>
            </div>
          </div>
        )}
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
              className={`${cellInputClass} text-right`}
            />
            {shakenOpen && (
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                ※ 割引は整備費用（通常明細）のみに適用されます
              </p>
            )}
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
              className={`${cellInputClass} text-right`}
            />
          </div>
        </div>

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
      </div>

      {/* 整備写真フォルダ URL / 帳票備考: 同じフォームで保存される。
          各 input/textarea の name 属性が server action（updateOrderItems）の
          formData.get(...) に対応する。 */}
      <div className="space-y-4">
        <div>
          <label
            htmlFor="photo_folder_url"
            className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            整備写真フォルダ
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
          onConfirm={handleMenuPickerConfirm}
          onClose={() => setMenuPickerOpen(false)}
        />
      )}
      {setPickerOpen && (
        <SetPickerModal
          sets={allSetsWithItems}
          onConfirm={handleSetPickerConfirm}
          onClose={() => setSetPickerOpen(false)}
        />
      )}
    </form>
  );
}

function ItemTableEditor({
  rows,
  onChange,
  section,
  onRegisterRow,
  registeringRow,
}: {
  rows: ItemRow[];
  onChange: (rows: ItemRow[]) => void;
  section: Section;
  onRegisterRow: (section: Section, index: number) => Promise<void>;
  registeringRow: { section: Section; index: number } | null;
}) {
  // 工賃 / 部品代 が編集された場合、片方でも値があれば単価を自動計算で上書き。
  // 両方クリアされたときは最後の計算値（または元の単価）を残して手動入力可能に戻る。
  function update(i: number, patch: Partial<ItemRow>) {
    onChange(
      rows.map((r, idx) => {
        if (idx !== i) return r;
        const updated = { ...r, ...patch };
        const touchedBreakdown =
          "labor_cost" in patch || "parts_cost" in patch;
        if (touchedBreakdown) {
          const hasBD =
            updated.labor_cost !== "" || updated.parts_cost !== "";
          if (hasBD) {
            const labor = Number(updated.labor_cost) || 0;
            const parts = Number(updated.parts_cost) || 0;
            updated.unit_price = String(labor + parts);
          }
        }
        return updated;
      }),
    );
  }
  function add() {
    onChange([...rows, emptyRow()]);
  }
  function remove(i: number) {
    onChange(rows.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-zinc-50 text-left text-xs uppercase tracking-wider text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
            <tr>
              <th
                className="border-b border-zinc-200 px-3 py-2 text-center font-medium dark:border-zinc-800"
                style={{ width: "44px" }}
              >
                #
              </th>
              <th
                className="border-b border-zinc-200 px-3 py-2 font-medium dark:border-zinc-800"
                style={{ minWidth: "200px" }}
              >
                品名
              </th>
              <th
                className="border-b border-zinc-200 px-3 py-2 font-medium dark:border-zinc-800"
                style={{ width: "80px" }}
              >
                数量
              </th>
              <th
                className="border-b border-zinc-200 px-3 py-2 font-medium dark:border-zinc-800"
                style={{ width: "120px" }}
              >
                工賃
              </th>
              <th
                className="border-b border-zinc-200 px-3 py-2 font-medium dark:border-zinc-800"
                style={{ width: "120px" }}
              >
                部品代
              </th>
              <th
                className="border-b border-zinc-200 px-3 py-2 font-medium dark:border-zinc-800"
                style={{ width: "150px" }}
              >
                単価
              </th>
              <th
                className="border-b border-zinc-200 px-3 py-2 text-right font-medium dark:border-zinc-800"
                style={{ width: "120px" }}
              >
                小計
              </th>
              <th
                className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-800"
                style={{ width: "56px" }}
              />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-4 text-center text-xs text-zinc-400 dark:text-zinc-500"
                >
                  明細はありません
                </td>
              </tr>
            ) : (
              rows.map((r, i) => {
                const auto = hasBreakdown(r);
                const zebra =
                  i % 2 === 0
                    ? "bg-zinc-50/60 dark:bg-zinc-800/30"
                    : "";
                return (
                <tr key={i} className={`align-top ${zebra}`}>
                  {/* 行番号バッジ: セクション内で 1 から振り直し。
                      行の追加/削除で自動的に再採番される（map の index ベース）。 */}
                  <td className="px-3 py-2 text-center">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-zinc-200 text-xs font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300">
                      {i + 1}
                    </span>
                  </td>
                  {/* 品名セル: 作業内容 / 部品名（任意）/ 補足（任意）の 3 段。
                      OrderItem の work_name / part_name / note にそれぞれ対応。 */}
                  <td className="px-3 py-2">
                    <div className="space-y-1">
                      <input
                        value={r.name}
                        onChange={(e) => update(i, { name: e.target.value })}
                        placeholder="作業内容（例: エンジンオイル交換）"
                        className={cellInputClass}
                      />
                      <input
                        value={r.part_name}
                        onChange={(e) =>
                          update(i, { part_name: e.target.value })
                        }
                        placeholder="部品名（任意）"
                        className={cellInputClass}
                      />
                      <textarea
                        value={r.note}
                        onChange={(e) => update(i, { note: e.target.value })}
                        rows={1}
                        placeholder="補足（任意）"
                        className={`${cellInputClass} resize-y`}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.1"
                      value={r.quantity}
                      onChange={(e) => update(i, { quantity: e.target.value })}
                      className={`${cellInputClass} text-right`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      value={r.labor_cost}
                      onChange={(e) =>
                        update(i, { labor_cost: e.target.value })
                      }
                      placeholder="—"
                      className={`${cellInputClass} text-right`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      value={r.parts_cost}
                      onChange={(e) =>
                        update(i, { parts_cost: e.target.value })
                      }
                      placeholder="—"
                      className={`${cellInputClass} text-right`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={1}
                        value={r.unit_price}
                        onChange={(e) =>
                          update(i, { unit_price: e.target.value })
                        }
                        readOnly={auto}
                        title={
                          auto
                            ? "工賃と部品代から自動計算されます（両方を空にすると手動入力可能）"
                            : undefined
                        }
                        className={`${cellInputClass} text-right ${
                          auto
                            ? "cursor-not-allowed bg-zinc-100 text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-400"
                            : ""
                        }`}
                      />
                      {auto && (
                        <span
                          aria-hidden
                          className="shrink-0 rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-medium leading-none text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
                        >
                          自動
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-900 dark:text-zinc-50">
                    {formatYen(rowSubtotal(toItem(r)))}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onRegisterRow(section, i)}
                        disabled={
                          registeringRow?.section === section &&
                          registeringRow?.index === i
                        }
                        aria-label="この行をマスターに登録"
                        title={
                          r.source_menu_id
                            ? "現在の内容で別のマスターとして登録"
                            : "マスターに登録"
                        }
                        className="rounded-md border border-amber-200 bg-white px-2 py-1 text-xs text-amber-700 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-900 dark:bg-zinc-900 dark:text-amber-400 dark:hover:bg-amber-950"
                      >
                        ☆
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(i)}
                        aria-label="行を削除"
                        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-red-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-red-400"
                      >
                        ×
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
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

const CATEGORY_LABEL: Record<WorkCategory, string> = {
  normal: "整備",
  shaken: "車検（課税）",
  shaken_tax_free: "車検（非課税）",
};

function menuRowTotal(m: WorkMenuItem): number {
  return m.default_labor_cost > 0 || m.default_parts_cost > 0
    ? m.default_labor_cost + m.default_parts_cost
    : m.default_unit_price;
}

function MenuPickerModal({
  allMenus,
  onConfirm,
  onClose,
}: {
  allMenus: WorkMenuItem[];
  onConfirm: (menus: WorkMenuItem[]) => void;
  onClose: () => void;
}) {
  type Filter = "all" | WorkCategory;
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    let list = allMenus;
    if (filter !== "all") list = list.filter((m) => m.category === filter);
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
            {(
              [
                ["all", "すべて"],
                ["normal", "整備"],
                ["shaken", "車検課税"],
                ["shaken_tax_free", "車検非課税"],
              ] as const
            ).map(([v, l]) => (
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
                        {CATEGORY_LABEL[m.category]}
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
// 「📦 作業セットから追加」モーダル
// ============================================
function SetPickerModal({
  sets,
  onConfirm,
  onClose,
}: {
  sets: SetWithItems[];
  onConfirm: (set: SetWithItems) => void;
  onClose: () => void;
}) {
  const [pickedId, setPickedId] = useState<string | null>(null);
  const picked = useMemo(
    () => sets.find((s) => s.set.id === pickedId) ?? null,
    [sets, pickedId],
  );

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
                            {CATEGORY_LABEL[x.menu.category]}
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
