"use client";

import { useEffect, useRef, useState, useTransition } from "react";

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
  const [pending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
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

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
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

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-20 mt-1 min-w-[7rem] overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
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
      )}
    </div>
  );
}
