// クライアント側でテナントの画像（ロゴ・印鑑）を fetch して
// data URL に変換するユーティリティ。
// PDF 生成側（generate.ts）は data URL を受け取るだけにして、
// fetch のタイミングと失敗時のフォールバックは呼び出し側（pdf-button）に切り出す。

export interface FetchedAssets {
  logoDataUrl?: string;
  stampDataUrl?: string;
}

// URL から画像を取得して data URL（base64）に変換する。
// 失敗時は undefined を返す（fail-soft：透かし or 表示なしで PDF 生成は継続）。
export async function fetchImageAsDataUrl(
  url: string | null | undefined,
): Promise<string | undefined> {
  if (!url) return undefined;
  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) return undefined;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

// ロゴと印鑑を並列で取得する。どちらか/両方失敗しても他方は通す。
export async function fetchTenantAssets(
  logoUrl?: string | null,
  stampUrl?: string | null,
): Promise<FetchedAssets> {
  const [logoDataUrl, stampDataUrl] = await Promise.all([
    fetchImageAsDataUrl(logoUrl),
    fetchImageAsDataUrl(stampUrl),
  ]);
  return { logoDataUrl, stampDataUrl };
}
