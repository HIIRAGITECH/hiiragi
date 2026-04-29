"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { updateShopAsset } from "./actions";

type Props = {
  userId: string;
  kind: "logo" | "stamp";
  currentPath: string | null;
  label: string;
  helpText?: string;
  requireTransparent?: boolean;
  maxSizeMB: number;
};

const ACCEPT_ALL = "image/png,image/jpeg,image/webp";
const ACCEPT_PNG_ONLY = "image/png";

export default function ImageUpload({
  userId,
  kind,
  currentPath,
  label,
  helpText,
  requireTransparent,
  maxSizeMB,
}: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!currentPath) {
      setPreviewUrl(null);
      return;
    }
    let cancelled = false;
    const supabase = createClient();
    supabase.storage
      .from("shop-assets")
      .createSignedUrl(currentPath, 3600)
      .then(({ data }) => {
        if (!cancelled && data) setPreviewUrl(data.signedUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [currentPath]);

  async function handleFile(file: File) {
    const allowed = requireTransparent
      ? ["image/png"]
      : ["image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(file.type)) {
      throw new Error(
        requireTransparent
          ? "印鑑はPNG形式でアップロードしてください。"
          : "PNG / JPEG / WebP 形式でアップロードしてください。",
      );
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      throw new Error(`ファイルサイズは ${maxSizeMB}MB 以内にしてください。`);
    }
    if (requireTransparent) {
      const transparent = await hasTransparency(file);
      if (!transparent) {
        throw new Error(
          "この画像は背景が透過されていません。背景透過PNGをご用意ください。",
        );
      }
    }

    const supabase = createClient();

    // 拡張子が変わった場合に旧ファイルが残らないよう、同 kind の既存を掃除
    const { data: existing } = await supabase.storage
      .from("shop-assets")
      .list(userId);
    const toDelete = (existing ?? [])
      .filter((f) => f.name.startsWith(`${kind}.`))
      .map((f) => `${userId}/${f.name}`);
    if (toDelete.length > 0) {
      await supabase.storage.from("shop-assets").remove(toDelete);
    }

    const ext =
      file.type === "image/png"
        ? "png"
        : file.type === "image/jpeg"
          ? "jpg"
          : "webp";
    const path = `${userId}/${kind}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from("shop-assets")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) throw new Error(`アップロードに失敗しました: ${upErr.message}`);

    const result = await updateShopAsset({ kind, path });
    if (result && "error" in result) throw new Error(result.error);

    startTransition(() => router.refresh());
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setError(null);
    setBusy(true);
    try {
      await handleFile(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!currentPath) return;
    if (!confirm(`${label}を削除しますか?`)) return;

    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: existing } = await supabase.storage
        .from("shop-assets")
        .list(userId);
      const toDelete = (existing ?? [])
        .filter((f) => f.name.startsWith(`${kind}.`))
        .map((f) => `${userId}/${f.name}`);
      if (toDelete.length > 0) {
        await supabase.storage.from("shop-assets").remove(toDelete);
      }
      const result = await updateShopAsset({ kind, path: null });
      if (result && "error" in result) throw new Error(result.error);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </p>
      {helpText && (
        <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
          {helpText}
        </p>
      )}
      <div className="flex items-start gap-4">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={label}
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="text-xs text-zinc-400">未設定</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={requireTransparent ? ACCEPT_PNG_ONLY : ACCEPT_ALL}
            onChange={onFileChange}
            disabled={busy}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {busy ? "処理中..." : currentPath ? "差し替え" : "ファイルを選択"}
          </button>
          {currentPath && (
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950"
            >
              削除
            </button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}

async function hasTransparency(file: File): Promise<boolean> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("画像を読み込めませんでした。"));
      i.src = url;
    });
    const canvas = document.createElement("canvas");
    const MAX = 256;
    const scale = Math.min(1, MAX / Math.max(img.width, img.height));
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 255) return true;
    }
    return false;
  } finally {
    URL.revokeObjectURL(url);
  }
}
