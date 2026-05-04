// data URL から画像フォーマットを判定。jsPDF の addImage に渡す形式名で返す。
// 想定外（HEIC など）は PNG として扱う（jsPDF が解釈できなければ呼び出し側で skip 判断）。
export function detectImageFormat(dataUrl: string): "PNG" | "JPEG" {
  if (dataUrl.startsWith("data:image/jpeg")) return "JPEG";
  if (dataUrl.startsWith("data:image/jpg")) return "JPEG";
  return "PNG";
}

export interface ImageDims {
  width: number;
  height: number;
}

// 画像の自然サイズを Image() で取得。ブラウザ専用。
// SSR で呼ばれた場合は安全に 1:1 を返す（実際には呼ばれない想定）。
export async function getImageNaturalSize(
  dataUrl: string,
): Promise<ImageDims> {
  if (typeof window === "undefined") {
    return { width: 1, height: 1 };
  }
  return await new Promise<ImageDims>((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
    img.src = dataUrl;
  });
}

// 元サイズを (maxW, maxH) の枠にアスペクト比保持で収める。
// w*ratio <= maxW かつ h*ratio <= maxH を満たす最大の倍率を選ぶ。
export function fitInBox(
  natural: ImageDims,
  maxW: number,
  maxH: number,
): { w: number; h: number } {
  const safeW = Math.max(1, natural.width);
  const safeH = Math.max(1, natural.height);
  const ratio = Math.min(maxW / safeW, maxH / safeH);
  return { w: safeW * ratio, h: safeH * ratio };
}

// 読み込み済み画像アセット。data URL + 自然サイズの組。
// generate.ts で事前 load して各 section/overlay に同期的に渡す。
export interface LoadedImage {
  dataUrl: string;
  width: number;
  height: number;
}

export async function loadImage(
  dataUrl: string | undefined,
): Promise<LoadedImage | null> {
  if (!dataUrl) return null;
  try {
    const dims = await getImageNaturalSize(dataUrl);
    return { dataUrl, width: dims.width, height: dims.height };
  } catch {
    return null;
  }
}
