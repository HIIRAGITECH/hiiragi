import type { jsPDF } from "jspdf";
import type { BankInfo } from "@/lib/types";
import { COLORS, FONT_FAMILY, FONT_SIZE } from "../constants";
import { ensureSpace, type RenderContext } from "../context";

// printable-document.tsx の hasBankInfo と完全に同じ判定
function hasBankInfo(b: BankInfo | undefined): b is BankInfo {
  if (!b) return false;
  return [b.bank_name, b.branch_name, b.account_number, b.account_holder].some(
    (v) => v.trim() !== "",
  );
}

// YYYY-MM-DD → 「YYYY年M月D日」（printable-document.tsx の formatDateJP と同等）
function formatDateJP(s: string): string {
  const [y, m, d] = s.split("-");
  return `${y}年${Number.parseInt(m, 10)}月${Number.parseInt(d, 10)}日`;
}

// 振込先 + 振込期限。請求書の場合のみ描画。
export function drawPaymentInfo(doc: jsPDF, ctx: RenderContext): number {
  if (ctx.input.documentType !== "invoice") return ctx.cursorY;

  const bank = ctx.input.shop.bank_info;
  const dueDate = ctx.input.order.payment_due_date;
  const showBank = hasBankInfo(bank);
  if (!showBank && !dueDate) return ctx.cursorY;

  let y = ctx.cursorY;

  // 振込先ボックス
  if (showBank && bank) {
    ensureSpace(doc, ctx, 30);
    const x = ctx.marginX;
    const width = ctx.pageWidth - ctx.marginX * 2;
    const boxH = 22;

    doc.setDrawColor(
      COLORS.tableLine[0],
      COLORS.tableLine[1],
      COLORS.tableLine[2],
    );
    doc.setLineWidth(0.2);
    doc.rect(x, y, width, boxH);

    doc.setFont(FONT_FAMILY, "bold");
    doc.setFontSize(FONT_SIZE.small);
    doc.setTextColor(COLORS.gray[0], COLORS.gray[1], COLORS.gray[2]);
    doc.text("お振込先", x + 2, y + 4);

    const labelX = x + 4;
    const valueX = x + 28;
    let rowY = y + 9;

    doc.setFont(FONT_FAMILY, "normal");
    doc.setFontSize(FONT_SIZE.body);
    doc.setTextColor(COLORS.black[0], COLORS.black[1], COLORS.black[2]);

    const bankAndBranch = [bank.bank_name, bank.branch_name]
      .filter((s) => s.trim() !== "")
      .join(" ");
    const accountLine = [bank.account_type, bank.account_number]
      .filter((s) => s.trim() !== "")
      .join(" ");

    if (bankAndBranch) {
      doc.setTextColor(COLORS.gray[0], COLORS.gray[1], COLORS.gray[2]);
      doc.text("銀行・支店", labelX, rowY);
      doc.setTextColor(COLORS.black[0], COLORS.black[1], COLORS.black[2]);
      doc.text(bankAndBranch, valueX, rowY);
      rowY += 4;
    }
    if (accountLine) {
      doc.setTextColor(COLORS.gray[0], COLORS.gray[1], COLORS.gray[2]);
      doc.text("種別 / 番号", labelX, rowY);
      doc.setTextColor(COLORS.black[0], COLORS.black[1], COLORS.black[2]);
      doc.text(accountLine, valueX, rowY);
      rowY += 4;
    }
    if (bank.account_holder.trim() !== "") {
      doc.setTextColor(COLORS.gray[0], COLORS.gray[1], COLORS.gray[2]);
      doc.text("名義", labelX, rowY);
      doc.setTextColor(COLORS.black[0], COLORS.black[1], COLORS.black[2]);
      doc.text(bank.account_holder, valueX, rowY);
      rowY += 4;
    }

    y += boxH + 4;
  }

  // 振込期限
  if (dueDate) {
    ensureSpace(doc, ctx, 10);
    doc.setFont(FONT_FAMILY, "normal");
    doc.setFontSize(FONT_SIZE.body);
    doc.setTextColor(COLORS.gray[0], COLORS.gray[1], COLORS.gray[2]);
    doc.text("お振込期限:", ctx.marginX, y + 4);
    doc.setFont(FONT_FAMILY, "bold");
    doc.setTextColor(COLORS.black[0], COLORS.black[1], COLORS.black[2]);
    doc.text(formatDateJP(dueDate), ctx.marginX + 22, y + 4);
    y += 8;
  }

  return y;
}
