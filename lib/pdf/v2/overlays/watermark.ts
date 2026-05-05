import type { jsPDF } from "jspdf";
import type { RenderContext } from "../context";
import { detectImageFormat, type LoadedImage } from "../utils/image";

const WATERMARK_WIDTH_RATIO = 0.6;
const WATERMARK_OPACITY = 0.08;

// jsPDF の GState 系 API は型定義に出ていないため最小限のキャストで包む
type JsPdfGStateExt = {
  GState: new (p: { opacity: number }) => unknown;
  setGState: (gs: unknown) => void;
  saveGraphicsState: () => void;
  restoreGraphicsState: () => void;
};

// ページ中央に透かしロゴを薄く描画する。
// jspdf には「ページ追加時のフック」がないため、generate の最後で
// 全ページをループしてこの関数を呼び出す。本文より後に描画されるため、
// 重なりを許容できる程度の opacity（〜0.1）にしている。
//
// 入力は事前 load 済みの LoadedImage（dataUrl + 自然サイズ）。
// 透かしは ctx.loadedAssets.logo を流用する想定。
export function drawWatermark(
  doc: jsPDF,
  ctx: RenderContext,
  asset: LoadedImage | null,
): void {
  if (!asset) return;

  const wmW = ctx.pageWidth * WATERMARK_WIDTH_RATIO;
  const wmH = wmW * (asset.height / Math.max(1, asset.width));
  const x = (ctx.pageWidth - wmW) / 2;
  const y = (ctx.pageHeight - wmH) / 2;

  const g = doc as unknown as JsPdfGStateExt;
  try {
    g.saveGraphicsState();
    g.setGState(new g.GState({ opacity: WATERMARK_OPACITY }));
    doc.addImage(
      asset.dataUrl,
      detectImageFormat(asset.dataUrl),
      x,
      y,
      wmW,
      wmH,
    );
  } finally {
    g.restoreGraphicsState();
  }
}
