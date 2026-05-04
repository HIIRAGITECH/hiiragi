import type { jsPDF } from "jspdf";
import {
  notoSansJPRegularBase64,
  notoSansJPBoldBase64,
} from "./noto-sans-jp";

// jsPDF インスタンスに NotoSansJP（Regular/Bold）を登録する。
// 呼び出し後は doc.setFont("NotoSansJP", "normal" | "bold") で切り替え可能。
export function registerJapaneseFont(doc: jsPDF): void {
  doc.addFileToVFS("NotoSansJP-Regular.ttf", notoSansJPRegularBase64);
  doc.addFont("NotoSansJP-Regular.ttf", "NotoSansJP", "normal");
  doc.addFileToVFS("NotoSansJP-Bold.ttf", notoSansJPBoldBase64);
  doc.addFont("NotoSansJP-Bold.ttf", "NotoSansJP", "bold");
  doc.setFont("NotoSansJP", "normal");
}
