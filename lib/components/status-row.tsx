import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  label: string;
  // 指定するとラベルを Link 化（hover:underline）。未指定なら通常の span。
  href?: string;
  children: ReactNode;
  className?: string;
};

// 受注一覧/詳細/アーカイブで「ラベル + バッジ or ドロップダウン」を1行で並べる用の小さなレイアウト。
// label は固定幅にして「作業/見積/請求」を縦に揃える。
// href を渡すとラベルがクリック可能なリンクになる（帳票への直接導線）。
export default function StatusRow({ label, href, children, className }: Props) {
  const labelClass =
    "w-8 shrink-0 text-xs text-zinc-500 dark:text-zinc-400";

  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      {href ? (
        <Link
          href={href}
          className={`${labelClass} underline-offset-2 hover:underline hover:text-zinc-700 dark:hover:text-zinc-300`}
        >
          {label}
        </Link>
      ) : (
        <span className={labelClass}>{label}</span>
      )}
      {children}
    </div>
  );
}
