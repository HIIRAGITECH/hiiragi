"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createClient } from "@/lib/supabase/client";
import type { PartImageWithUrl } from "@/lib/types";
import {
  MAX_PART_IMAGES,
  PART_IMAGES_BUCKET,
  PART_IMAGE_ACCEPT,
  PART_IMAGE_MAX_EDGE,
  PART_IMAGE_QUALITY,
  buildPartImagePath,
} from "@/lib/parts/images";
import {
  deletePartImage,
  registerPartImage,
  reorderPartImages,
} from "./image-actions";

// 部品の商品画像を編集するセクション。**部品本体フォームの外**に置く（独立したカード）。
// 本体・価格カードは画面下の「更新する」で一括保存だが、画像は Storage への直接アップロードを
// 伴うため足並みを揃えられない。よって **操作した時点で即確定**する流儀にし、その旨を画面にも書く。
//
// 並べ替えは既存の @dnd-kit（部品一覧・作業メニューと同じ流儀）を流用。先頭が代表画像＝一覧のサムネイル。
export default function PartImagesSection({
  userId,
  partId,
  images,
}: {
  userId: string;
  partId: string;
  images: PartImageWithUrl[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<PartImageWithUrl[]>(images);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // サーバー再取得（署名付きURLの再発行を含む）で同期する。
  useEffect(() => {
    setItems(images);
  }, [images]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const remaining = MAX_PART_IMAGES - items.length;
  const locked = busy || pending;

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldI = items.findIndex((x) => x.id === active.id);
    const newI = items.findIndex((x) => x.id === over.id);
    if (oldI < 0 || newI < 0) return;
    const next = arrayMove(items, oldI, newI);
    setItems(next);
    setError(null);
    startTransition(async () => {
      const res = await reorderPartImages(
        partId,
        next.map((x) => x.id),
      );
      if ("error" in res) {
        setError(res.error);
        setItems(items); // 失敗したら元の並びに戻す
      }
      router.refresh();
    });
  }

  async function onFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    setError(null);
    setBusy(true);
    try {
      if (files.length > remaining) {
        throw new Error(
          `あと ${remaining} 枚まで追加できます（1部品あたり最大 ${MAX_PART_IMAGES} 枚）。`,
        );
      }

      const supabase = createClient();
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress(`${i + 1} / ${files.length} 枚目を処理中…`);

        if (!file.type.startsWith("image/")) {
          throw new Error(`「${file.name}」は画像ファイルではありません。`);
        }

        // 原寸のままは上げない。長辺 1600px に収めて再エンコードする。
        const shrunk = await shrinkImage(file);
        const path = buildPartImagePath(
          userId,
          partId,
          `${crypto.randomUUID()}.${shrunk.ext}`,
        );

        const { error: upErr } = await supabase.storage
          .from(PART_IMAGES_BUCKET)
          .upload(path, shrunk.blob, {
            contentType: shrunk.contentType,
            upsert: false,
          });
        if (upErr) {
          throw new Error(`アップロードに失敗しました: ${upErr.message}`);
        }

        // 実体が上がってから DB に登録する。失敗時はサーバー側で実体を掃除する。
        const res = await registerPartImage({
          part_id: partId,
          storage_path: path,
        });
        if ("error" in res) throw new Error(res.error);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      router.refresh();
    } finally {
      setProgress(null);
      setBusy(false);
    }
  }

  async function onDelete(image: PartImageWithUrl) {
    if (!confirm("この画像を削除しますか？\n（元に戻せません）")) return;
    setBusy(true);
    setError(null);
    const res = await deletePartImage(image.id);
    setBusy(false);
    if ("error" in res) setError(res.error);
    router.refresh();
  }

  return (
    <div className="wos-card">
      <div className="wos-sec-label mb-1">商品画像</div>
      <p className="mb-4 text-xs text-[var(--color-ink-light)]">
        部品の写真を最大 {MAX_PART_IMAGES} 枚まで登録できます（任意）。
        <strong className="font-medium text-[var(--color-ink-mid)]">
          先頭の画像が一覧のサムネイル（代表画像）
        </strong>
        になります。ドラッグで並べ替えできます。画像は
        <strong className="font-medium text-[var(--color-ink-mid)]">
          選択・削除した時点で保存されます
        </strong>
        （下の「更新する」は不要）。アップロード時に自動で縮小・圧縮されます。
      </p>

      {items.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-light)]">
          画像が登録されていません。
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={items.map((x) => x.id)}
            strategy={rectSortingStrategy}
          >
            <div className="flex flex-wrap gap-3">
              {items.map((image, index) => (
                <SortableImageCard
                  key={image.id}
                  image={image}
                  isPrimary={index === 0}
                  disabled={locked}
                  onDelete={() => onDelete(image)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={PART_IMAGE_ACCEPT}
        multiple
        onChange={onFilesChange}
        disabled={locked || remaining <= 0}
        className="hidden"
      />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={locked || remaining <= 0}
          className="wos-btn-ghost wos-btn-sm"
        >
          ＋ 画像を追加
        </button>
        <span className="text-xs text-[var(--color-ink-light)]">
          {items.length} / {MAX_PART_IMAGES} 枚
          {remaining <= 0 && "（上限に達しています）"}
        </span>
        {progress && (
          <span className="text-xs text-[var(--color-ink-mid)]">{progress}</span>
        )}
      </div>

      {error && (
        <p role="alert" className="wos-alert warn mt-3">
          {error}
        </p>
      )}
    </div>
  );
}

function SortableImageCard({
  image,
  isPrimary,
  disabled,
  onDelete,
}: {
  image: PartImageWithUrl;
  isPrimary: boolean;
  disabled: boolean;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: image.id, disabled });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative w-28 border border-[var(--color-line)] bg-[var(--color-cream)] p-1"
    >
      <div className="flex h-24 w-full items-center justify-center overflow-hidden bg-[var(--color-paper)]">
        {image.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.url}
            alt=""
            className="h-full w-full object-contain"
            draggable={false}
          />
        ) : (
          <span className="text-[10px] text-[var(--color-ink-light)]">
            読み込めません
          </span>
        )}
      </div>

      {isPrimary && (
        <span className="absolute left-1 top-1 bg-[var(--color-ink)] px-1.5 py-0.5 text-[10px] leading-none text-[var(--color-paper)]">
          代表
        </span>
      )}

      <div className="mt-1 flex items-center justify-between">
        <button
          type="button"
          className={`select-none px-1 text-[var(--color-ink-light)] ${
            disabled
              ? "cursor-not-allowed opacity-30"
              : "cursor-grab hover:text-[var(--color-ink)] active:cursor-grabbing"
          }`}
          aria-label="ドラッグして並べ替え"
          {...attributes}
          {...listeners}
        >
          ⠿
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={disabled}
          className="wos-btn-danger wos-btn-xs"
        >
          削除
        </button>
      </div>
    </div>
  );
}

// ============================================
// クライアント側リサイズ・圧縮（原寸のまま上げない）
// ============================================
// 長辺 PART_IMAGE_MAX_EDGE に収めて再エンコードする。副次的に EXIF も落ちる（撮影場所等を上げない）。
// 出力は WebP を優先し、非対応ブラウザは JPEG → PNG の順にフォールバックする
// （いずれもバケットの allowed_mime_types に含まれる）。
async function shrinkImage(
  file: File,
): Promise<{ blob: Blob; ext: string; contentType: string }> {
  const bitmap = await loadBitmap(file);
  const scale = Math.min(
    1,
    PART_IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height),
  );
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画像の変換に失敗しました（canvas 非対応）。");

  // JPEG にフォールバックしたとき透過部分が黒くならないよう、白で塗ってから描く。
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  if ("close" in bitmap) bitmap.close();

  for (const type of ["image/webp", "image/jpeg", "image/png"] as const) {
    const blob = await toBlob(canvas, type, PART_IMAGE_QUALITY);
    // toBlob は非対応 type を黙って PNG に差し替えることがあるので、実際の type で判定する。
    if (blob && blob.type === type) {
      return { blob, ext: extOf(type), contentType: type };
    }
    if (blob && type === "image/png") {
      return { blob, ext: "png", contentType: blob.type || "image/png" };
    }
  }
  throw new Error("画像の変換に失敗しました。別の画像でお試しください。");
}

function extOf(type: string): string {
  if (type === "image/webp") return "webp";
  if (type === "image/jpeg") return "jpg";
  return "png";
}

function toBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

// createImageBitmap があれば EXIF の向きを反映して読む。無ければ <img> で読む。
async function loadBitmap(
  file: File,
): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // 一部ブラウザは imageOrientation 未対応。素で読み直す。
      try {
        return await createImageBitmap(file);
      } catch {
        // 下の <img> 経路にフォールバック
      }
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("画像を読み込めませんでした。"));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
