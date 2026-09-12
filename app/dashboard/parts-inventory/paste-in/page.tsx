import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { PartsInventory, PartsInventoryVariant } from "@/lib/types";
import PasteStockInForm, { type PastePart } from "../paste-in-form";

export const metadata: Metadata = {
  title: "貼り付け入庫 | HIIRAGI",
};

// 貼り付け入庫。納品書から起こしたタブ区切り表を貼り付けて、既存部品の入庫と新規登録を一括で行う。
// 照合はクライアント側で即時に行うため、テナントのアクティブ部品（照合に必要な最小情報＋参考定価）を
// ここで渡す。DBへの書き込みは「確定」時のサーバーアクション（commit_paste_stock_in）だけが行う。
export default async function PasteStockInPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: partsData } = await supabase
    .from("parts_inventory")
    .select("id, name, external_code, cost_price, unit")
    .eq("user_id", user!.id)
    .is("deleted_at", null)
    .order("display_order", { ascending: true });

  // 参考表示用に、各部品の二階(variant)の定価(list_price)を集める（表示のみ・更新はしない）。
  const { data: variantsData } = await supabase
    .from("parts_inventory_variants")
    .select("part_id, list_price")
    .eq("user_id", user!.id)
    .is("deleted_at", null);

  const listPricesByPart: Record<string, number[]> = {};
  for (const v of (variantsData ?? []) as Pick<
    PartsInventoryVariant,
    "part_id" | "list_price"
  >[]) {
    if (v.list_price == null) continue;
    (listPricesByPart[v.part_id] ??= []).push(v.list_price);
  }

  const parts: PastePart[] = (
    (partsData ?? []) as Pick<
      PartsInventory,
      "id" | "name" | "external_code" | "cost_price" | "unit"
    >[]
  ).map((p) => ({
    id: p.id,
    name: p.name,
    external_code: p.external_code,
    cost_price: Number(p.cost_price),
    unit: p.unit,
    // 参考定価は重複を除いて渡す（表示のみ）。
    list_prices: Array.from(new Set(listPricesByPart[p.id] ?? [])),
  }));

  return (
    <>
      <div className="wos-pagehead">
        <div className="min-w-0 flex-1">
          <div className="wos-crumbs">
            <Link href="/dashboard/parts-inventory" className="hover:underline">
              工房 ／ 部品在庫
            </Link>{" "}
            ／ 貼り付け入庫
          </div>
          <h1>貼り付け入庫</h1>
          <div className="wos-gloss">
            納品書の表（品番／品名／数量／単価／希望小売価格）を貼り付けて、まとめて入庫します。
            仕入れ品番で照合し、確認画面で扱いを決めてから確定します。
          </div>
        </div>
        <div className="wos-actions">
          <Link
            href="/dashboard/parts-inventory"
            className="wos-btn-ghost wos-btn-sm"
          >
            ← 一覧へ戻る
          </Link>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[var(--color-cream)]">
        <div className="px-4 sm:px-8 py-6">
          <PasteStockInForm parts={parts} />
        </div>
      </div>
    </>
  );
}
