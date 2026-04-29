import type { ReactNode } from "react";

type Props = {
  content: ReactNode;
  children: ReactNode;
  className?: string;
};

// PC ホバー時にカード状で全文を見せるツールチップ。
// CSS のみ（group-hover）で完結するため Server Component としても利用可。
// 改行は whitespace-pre-wrap で反映される。
// スマホ（hover 不可端末）では非表示のまま。スマホ向けの全文表示は
// 行展開などで別途扱う想定。
export default function Tooltip({ content, children, className }: Props) {
  return (
    <span
      className={`group/tooltip relative inline-flex max-w-full ${className ?? ""}`}
    >
      {children}
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-pre-wrap break-words rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs leading-relaxed text-zinc-700 opacity-0 shadow-lg transition-opacity duration-150 group-hover/tooltip:visible group-hover/tooltip:opacity-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
        style={{ width: "max-content", maxWidth: "min(320px, 80vw)" }}
      >
        {content}
      </span>
    </span>
  );
}
