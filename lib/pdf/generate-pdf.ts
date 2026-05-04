/**
 * @deprecated v2 (lib/pdf/v2) に移行済み。次のリリースで削除予定。
 * 旧 html2canvas-pro 方式の PDF 生成器。新規呼び出しは追加しないこと。
 */
import html2canvas from "html2canvas-pro";
import { jsPDF } from "jspdf";

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const BLOB_URL_TTL_MS = 60_000;

// 透かしロゴの最大サイズ（ページ幅に対する比率）
const WATERMARK_WIDTH_RATIO = 0.5;
// 透かしロゴの透明度（読みにくくならない範囲、8〜15% 推奨）
const WATERMARK_OPACITY = 0.1;
// ページ上部のヘッダー位置（mm）
const HEADER_Y_MM = 8;
const HEADER_RIGHT_MARGIN_MM = 10;
const HEADER_FONT_SIZE = 9;

export type GeneratePdfOptions = {
  // 2ページ目以降のヘッダーテキスト（英字推奨。jsPDF のデフォルトフォントは
  // 日本語非対応のため、現状は ASCII のみ確実に表示できる）
  headerText?: string;
  // 透かしロゴ画像 URL（署名 URL 等、CORS 取得可能なもの）。null/undefined なら透かしなし
  watermarkUrl?: string | null;
};

type WatermarkData = { dataUrl: string; w: number; h: number };

// jsPDF の GState 周り（型定義に出ていないので最小限のキャストヘルパで包む）
type JsPdfGraphicsExt = {
  GState: new (p: { opacity: number }) => unknown;
  setGState: (gs: unknown) => void;
  saveGraphicsState: () => void;
  restoreGraphicsState: () => void;
};

function isIOS(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return false;
  }
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window)
  );
}

async function captureElement(
  element: HTMLElement,
  scale: number,
): Promise<HTMLCanvasElement> {
  return await html2canvas(element, {
    scale,
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false,
    onclone: (clonedDoc: Document) => {
      clonedDoc.documentElement.classList.remove("dark");
      if (clonedDoc.body) {
        clonedDoc.body.classList.remove("dark");
      }
      const target = clonedDoc.getElementById(element.id);
      if (target instanceof HTMLElement) {
        target.setAttribute("data-pdf-mode", "light");
        target.style.backgroundColor = "#ffffff";
        target.style.color = "#000000";
      }
    },
  });
}

async function loadImageAsDataUrl(url: string): Promise<WatermarkData> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const blob = await response.blob();

  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

  const dims: { w: number; h: number } = await new Promise(
    (resolve, reject) => {
      const img = new Image();
      img.onload = () =>
        resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
      img.src = dataUrl;
    },
  );

  return { dataUrl, w: dims.w, h: dims.h };
}

function drawWatermark(pdf: jsPDF, watermark: WatermarkData | null): void {
  if (!watermark) return;
  const wmW = A4_WIDTH_MM * WATERMARK_WIDTH_RATIO;
  const wmH = wmW * (watermark.h / watermark.w);
  const cx = (A4_WIDTH_MM - wmW) / 2;
  const cy = (A4_HEIGHT_MM - wmH) / 2;

  const g = pdf as unknown as JsPdfGraphicsExt;
  g.saveGraphicsState();
  g.setGState(new g.GState({ opacity: WATERMARK_OPACITY }));
  pdf.addImage(watermark.dataUrl, "PNG", cx, cy, wmW, wmH);
  g.restoreGraphicsState();
}

function drawContinuedHeader(
  pdf: jsPDF,
  headerText: string,
  pageNum: number,
  totalPages: number,
): void {
  pdf.setFontSize(HEADER_FONT_SIZE);
  pdf.setTextColor(140, 140, 140);
  const text = `${headerText} (${pageNum}/${totalPages})`;
  pdf.text(text, A4_WIDTH_MM - HEADER_RIGHT_MARGIN_MM, HEADER_Y_MM, {
    align: "right",
  });
  pdf.setTextColor(0, 0, 0);
}

function addImagePaginated(
  pdf: jsPDF,
  dataUrl: string,
  canvasWidth: number,
  canvasHeight: number,
  options: GeneratePdfOptions,
  watermark: WatermarkData | null,
): void {
  const imgWidth = A4_WIDTH_MM;
  const pageHeight = A4_HEIGHT_MM;
  const imgHeight = (canvasHeight * imgWidth) / canvasWidth;
  const totalPages = Math.max(1, Math.ceil(imgHeight / pageHeight));

  let heightLeft = imgHeight;
  let position = 0;
  let pageNum = 1;

  // 1ページ目: ヘッダーは出さない（要件通り）
  pdf.addImage(dataUrl, "PNG", 0, position, imgWidth, imgHeight);
  drawWatermark(pdf, watermark);
  heightLeft -= pageHeight;

  // 2ページ目以降: 同じ画像をオフセット位置で貼る + ヘッダー + 透かし
  while (heightLeft > 0) {
    pageNum += 1;
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(dataUrl, "PNG", 0, position, imgWidth, imgHeight);
    drawWatermark(pdf, watermark);
    if (options.headerText) {
      drawContinuedHeader(pdf, options.headerText, pageNum, totalPages);
    }
    heightLeft -= pageHeight;
  }
}

function deliverBlob(blobUrl: string, fileName: string): void {
  if (isIOS()) {
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = fileName;
    link.target = "_blank";
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return;
  }

  const newWindow = window.open(blobUrl, "_blank");
  if (!newWindow) {
    alert(
      "ポップアップがブロックされました。ブラウザの設定で許可してください。",
    );
  }
}

export async function generatePdfFromElement(
  element: HTMLElement,
  fileName: string,
  options: GeneratePdfOptions = {},
): Promise<void> {
  let canvas: HTMLCanvasElement;
  try {
    canvas = await captureElement(element, 2);
  } catch (firstError: unknown) {
    console.warn("PDF生成: scale=2 失敗、scale=1 で再試行", firstError);
    try {
      canvas = await captureElement(element, 1);
    } catch (secondError: unknown) {
      console.error("PDF生成: 完全に失敗", secondError);
      alert(
        "PDF生成に失敗しました。明細が多すぎるか、画像の読み込みに失敗した可能性があります。",
      );
      return;
    }
  }

  // 透かしロゴを base64 化（失敗しても本文 PDF 生成は継続）
  let watermark: WatermarkData | null = null;
  if (options.watermarkUrl) {
    try {
      watermark = await loadImageAsDataUrl(options.watermarkUrl);
    } catch (err) {
      console.warn("透かしロゴの読み込みに失敗（透かしなしで継続）", err);
    }
  }

  try {
    const dataUrl = canvas.toDataURL("image/png");

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    addImagePaginated(pdf, dataUrl, canvas.width, canvas.height, options, watermark);

    const blob = pdf.output("blob");
    const blobUrl = URL.createObjectURL(blob);

    deliverBlob(blobUrl, fileName);

    setTimeout(() => URL.revokeObjectURL(blobUrl), BLOB_URL_TTL_MS);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("PDF生成失敗:", err);
    alert("PDF生成に失敗しました: " + message);
  }
}
