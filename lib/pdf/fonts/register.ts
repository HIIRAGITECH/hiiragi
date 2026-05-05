import type { jsPDF } from "jspdf";
import {
  notoSansJPRegularBase64,
  notoSansJPBoldBase64,
} from "./noto-sans-jp";

// jsPDF インスタンスに NotoSansJP（Regular/Bold）を登録する。
// 呼び出し後は doc.setFont("NotoSansJP", "normal" | "bold") で切り替え可能。
export function registerJapaneseFont(doc: jsPDF): void {
  // [DEBUG] 本番で base64 が破壊されていないか確認するための一時的なデバッグログ
  // 仮説確定後に削除予定
  console.log("[font-debug]", {
    regularDefined: typeof notoSansJPRegularBase64 === "string",
    regularLength: notoSansJPRegularBase64?.length,
    regularHead: notoSansJPRegularBase64?.slice(0, 32),
    regularTail: notoSansJPRegularBase64?.slice(-32),
    boldDefined: typeof notoSansJPBoldBase64 === "string",
    boldLength: notoSansJPBoldBase64?.length,
    boldHead: notoSansJPBoldBase64?.slice(0, 32),
    boldTail: notoSansJPBoldBase64?.slice(-32),
  });

  doc.addFileToVFS("NotoSansJP-Regular.ttf", notoSansJPRegularBase64);
  doc.addFont("NotoSansJP-Regular.ttf", "NotoSansJP", "normal");
  doc.addFileToVFS("NotoSansJP-Bold.ttf", notoSansJPBoldBase64);
  doc.addFont("NotoSansJP-Bold.ttf", "NotoSansJP", "bold");
  doc.setFont("NotoSansJP", "normal");
}
