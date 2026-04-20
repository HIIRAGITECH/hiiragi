import type { OrderItem } from "@/lib/types";

export const TAX_RATE = 0.1;

export type OrderTotals = {
  subtotal: number;       // 明細小計の合計
  discount: number;       // 割引額
  taxableAmount: number;  // 課税対象額（小計 − 割引）
  tax: number;            // 消費税（端数切り捨て）
  total: number;          // 合計（課税対象額 + 消費税）
  deposit: number;        // 預かり金
  balance: number;        // 差引請求額（合計 − 預かり金）
};

function rowSubtotal(item: OrderItem): number {
  return Math.round((item.quantity ?? 0) * (item.unit_price ?? 0));
}

export function calculateTotals(
  items: OrderItem[],
  discountAmount: number,
  depositAmount: number,
): OrderTotals {
  const subtotal = items.reduce((sum, i) => sum + rowSubtotal(i), 0);
  const discount = Math.max(0, discountAmount);
  const taxableAmount = Math.max(0, subtotal - discount);
  const tax = Math.floor(taxableAmount * TAX_RATE);
  const total = taxableAmount + tax;
  const deposit = Math.max(0, depositAmount);
  const balance = total - deposit;
  return { subtotal, discount, taxableAmount, tax, total, deposit, balance };
}

export { rowSubtotal };
