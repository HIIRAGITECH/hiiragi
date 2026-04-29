import type { OrderItem } from "@/lib/types";

export const TAX_RATE = 0.1;

export type SectionTotals = {
  subtotal: number;
  tax: number;
  total: number;
};

export type OrderTotals = {
  // 既存フィールド（呼び出し側との後方互換のため維持）
  subtotal: number; // 全明細行の合計（セクション問わず）
  discount: number; // 割引額（整備費用セクションに適用）
  taxableAmount: number; // 課税対象額（整備課税分 + 車検課税分）
  tax: number; // 消費税合計（整備 + 車検課税分）
  total: number; // 全体合計（全セクション合計、預かり金控除前）
  deposit: number; // 預かり金
  balance: number; // 差引請求額（total − deposit）

  // 新規: セクション別内訳
  sections: {
    // 整備費用: 通常明細（type === 'normal' or undefined）。全体割引はここに適用
    normal: {
      subtotal: number;
      taxableAmount: number; // max(0, subtotal − discount)
      tax: number;
      total: number; // taxableAmount + tax
    };
    // 車検費用 課税分: type === 'shaken' かつ !tax_free
    shakenTaxable: SectionTotals;
    // 車検費用 非課税分: type === 'shaken' かつ tax_free
    // 税なしのため total === subtotal
    shakenTaxFree: {
      subtotal: number;
      total: number;
    };
  };
};

function rowSubtotal(item: OrderItem): number {
  return Math.round((item.quantity ?? 0) * (item.unit_price ?? 0));
}

function itemType(i: OrderItem): "normal" | "shaken" {
  return i.type === "shaken" ? "shaken" : "normal";
}

export function calculateTotals(
  items: OrderItem[],
  discountAmount: number,
  depositAmount: number,
): OrderTotals {
  let normalSub = 0;
  let shakenTaxableSub = 0;
  let shakenTaxFreeSub = 0;

  for (const it of items) {
    const sub = rowSubtotal(it);
    if (itemType(it) === "shaken") {
      if (it.tax_free) shakenTaxFreeSub += sub;
      else shakenTaxableSub += sub;
    } else {
      normalSub += sub;
    }
  }

  const discount = Math.max(0, discountAmount);

  const normalTaxable = Math.max(0, normalSub - discount);
  const normalTax = Math.floor(normalTaxable * TAX_RATE);
  const normalTotal = normalTaxable + normalTax;

  const shakenTaxableTax = Math.floor(shakenTaxableSub * TAX_RATE);
  const shakenTaxableTotal = shakenTaxableSub + shakenTaxableTax;

  const shakenTaxFreeTotal = shakenTaxFreeSub;

  const subtotal = normalSub + shakenTaxableSub + shakenTaxFreeSub;
  const taxableAmount = normalTaxable + shakenTaxableSub;
  const tax = normalTax + shakenTaxableTax;
  const total = normalTotal + shakenTaxableTotal + shakenTaxFreeTotal;
  const deposit = Math.max(0, depositAmount);
  const balance = total - deposit;

  return {
    subtotal,
    discount,
    taxableAmount,
    tax,
    total,
    deposit,
    balance,
    sections: {
      normal: {
        subtotal: normalSub,
        taxableAmount: normalTaxable,
        tax: normalTax,
        total: normalTotal,
      },
      shakenTaxable: {
        subtotal: shakenTaxableSub,
        tax: shakenTaxableTax,
        total: shakenTaxableTotal,
      },
      shakenTaxFree: {
        subtotal: shakenTaxFreeSub,
        total: shakenTaxFreeTotal,
      },
    },
  };
}

export { rowSubtotal };
