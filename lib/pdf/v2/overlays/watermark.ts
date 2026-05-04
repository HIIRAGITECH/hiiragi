import type { jsPDF } from "jspdf";
import type { RenderContext } from "../context";

const WATERMARK_WIDTH_RATIO = 0.6;
const WATERMARK_OPACITY = 0.08;

// jsPDF の GState 系 API は型定義に出ていないため最小限のキャストで包む
type JsPdfGStateExt = {
  GState: new (p: { opacity: number }) => unknown;
  setGState: (gs: unknown) => void;
  saveGraphicsState: () => void;
  restoreGraphicsState: () => void;
};

function detectImageFormat(dataUrl: string): "PNG" | "JPEG" {
  if (dataUrl.startsWith("data:image/jpeg")) return "JPEG";
  if (dataUrl.startsWith("data:image/jpg")) return "JPEG";
  return "PNG";
}

export interface WatermarkAssets {
  dataUrl: string;
  width: number;
  height: number;
}

// 画像の自然サイズを Image() で取得（ブラウザ専用）。
// SSR では呼ばれない想定だが、安全に 1:1 を返すフォールバックを置く。
export async function loadWatermark(
  dataUrl: string,
): Promise<WatermarkAssets> {
  if (typeof window === "undefined") {
    return { dataUrl, width: 1, height: 1 };
  }
  return await new Promise<WatermarkAssets>((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({
        dataUrl,
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
    img.onerror = () =>
      reject(new Error("透かし画像の読み込みに失敗しました"));
    img.src = dataUrl;
  });
}

// ページ中央に透かしロゴを薄く描画する。
// jspdf には「ページ追加時のフック」がないため、generate の最後で
// 全ページをループしてこの関数を呼び出す。本文より後に描画されるため、
// 重なりを許容できる程度の opacity（〜0.1）にしている。
export function drawWatermark(
  doc: jsPDF,
  ctx: RenderContext,
  assets: WatermarkAssets | null,
): void {
  if (!assets) return;

  const wmW = ctx.pageWidth * WATERMARK_WIDTH_RATIO;
  const wmH = wmW * (assets.height / Math.max(1, assets.width));
  const x = (ctx.pageWidth - wmW) / 2;
  const y = (ctx.pageHeight - wmH) / 2;

  const g = doc as unknown as JsPdfGStateExt;
  try {
    g.saveGraphicsState();
    g.setGState(new g.GState({ opacity: WATERMARK_OPACITY }));
    doc.addImage(
      assets.dataUrl,
      detectImageFormat(assets.dataUrl),
      x,
      y,
      wmW,
      wmH,
    );
  } finally {
    g.restoreGraphicsState();
  }
}
