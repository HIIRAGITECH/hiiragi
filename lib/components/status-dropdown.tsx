"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";

type ConfirmOn<T extends string> = {
  // 指定値に変更しようとしたとき confirm() で確認する
  value: T;
  message: string;
};

type Props<T extends string> = {
  value: T;
  options: readonly T[];
  classMap: Record<T, string>;
  // バッジを押したときに開く。クリックで Server Action を呼ぶ
  // 戻り値はエラー表現を含む可能性があるため unknown で受ける（将来トースト対応の余地）
  onSelect: (next: T) => Promise<unknown> | unknown;
  confirmOn?: ConfirmOn<T>;
  ariaLabel?: string;
  // バッジ枠（デフォルトは status-badge と同形）
  baseClassName?: string;
};

const DEFAULT_BASE =
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium";

// メニュー1項目の概算高さ（px）。上下配置の判定にだけ使うので厳密でなくて良い。
const MENU_ITEM_HEIGHT = 36;
const MENU_VERTICAL_PADDING = 8;
const MENU_GAP = 4;

type MenuPosition = {
  top: number;
  left: number;
};

export default function StatusDropdown<T extends string>({
  value,
  options,
  classMap,
  onSelect,
  confirmOn,
  ariaLabel,
  baseClassName,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const [pending, startTransition] = useTransition();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // メニュー位置の計算（ボタン直下、画面下端で空きが足りなければ上方向に展開）
  function computePosition(): MenuPosition | null {
    const btn = buttonRef.current;
    if (!btn) return null;
    const rect = btn.getBoundingClientRect();
    const estimatedMenuHeight =
      options.length * MENU_ITEM_HEIGHT + MENU_VERTICAL_PADDING;
    const spaceBelow = window.innerHeight - rect.bottom;
    const placeAbove =
      spaceBelow < estimatedMenuHeight && rect.top > estimatedMenuHeight;

    return {
      top: placeAbove
        ? rect.top - estimatedMenuHeight - MENU_GAP + window.scrollY
        : rect.bottom + MENU_GAP + window.scrollY,
      left: rect.left + window.scrollX,
    };
  }

  function openMenu() {
    const pos = computePosition();
    if (!pos) return;
    setPosition(pos);
    setOpen(true);
  }

  function toggleMenu() {
    if (open) {
      setOpen(false);
    } else {
      openMenu();
    }
  }

  // 開いている間: 外クリック / ESC / スクロール / リサイズで閉じる
  useEffect(() => {
    if (!open) return;
    function close() {
      setOpen(false);
    }
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (
        buttonRef.current &&
        !buttonRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    // capture: true で祖先要素のスクロールも検知（テーブル横スクロール等）
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  function handleSelect(next: T) {
    setOpen(false);
    if (next === value) return;
    if (
      confirmOn &&
      next === confirmOn.value &&
      typeof window !== "undefined" &&
      !window.confirm(confirmOn.message)
    ) {
      return;
    }
    startTransition(async () => {
      await onSelect(next);
    });
  }

  const base = baseClassName ?? DEFAULT_BASE;

  const menu =
    open && position ? (
      <div
        ref={menuRef}
        role="listbox"
        style={{
          position: "absolute",
          top: position.top,
          left: position.left,
          zIndex: 50,
        }}
        className="min-w-[7rem] overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
      >
        {options.map((o) => {
          const selected = o === value;
          return (
            <button
              key={o}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => handleSelect(o)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-700 ${
                selected
                  ? "bg-zinc-50 font-semibold text-zinc-900 dark:bg-zinc-900 dark:text-zinc-50"
                  : "text-zinc-700 dark:text-zinc-300"
              }`}
            >
              <span
                aria-hidden
                className={`inline-block h-2 w-2 shrink-0 rounded-full ${classMap[o]}`}
              />
              <span>{o}</span>
              {selected && (
                <span aria-hidden className="ml-auto text-[10px]">
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>
    ) : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleMenu}
        disabled={pending}
        aria-label={ariaLabel ?? "ステータスを変更"}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`${base} ${classMap[value]} cursor-pointer transition-opacity hover:opacity-80 disabled:cursor-wait disabled:opacity-60`}
      >
        <span>{value}</span>
        <span aria-hidden className="text-[8px] leading-none opacity-70">
          ▼
        </span>
      </button>
      {menu && createPortal(menu, document.body)}
    </>
  );
}
