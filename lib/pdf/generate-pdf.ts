import html2canvas from "html2canvas-pro";
import { jsPDF } from "jspdf";

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const BLOB_URL_TTL_MS = 60_000;

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

function addImagePaginated(
  pdf: jsPDF,
  dataUrl: string,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const imgWidth = A4_WIDTH_MM;
  const pageHeight = A4_HEIGHT_MM;
  const imgHeight = (canvasHeight * imgWidth) / canvasWidth;

  let heightLeft = imgHeight;
  let position = 0;

  pdf.addImage(dataUrl, "PNG", 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(dataUrl, "PNG", 0, position, imgWidth, imgHeight);
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

  try {
    const dataUrl = canvas.toDataURL("image/png");

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    addImagePaginated(pdf, dataUrl, canvas.width, canvas.height);

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
