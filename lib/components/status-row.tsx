import type { ReactNode } from "react";

type Props = {
  label: string;
  children: ReactNode;
  className?: string;
};

// 受注一覧/詳細/アーカイブで「ラベル + バッジ or ドロップダウン」を1行で並べる用の小さなレイアウト。
// label は固定幅にして「作業/見積/請求」を縦に揃える。
export default function StatusRow({ label, children, className }: Props) {
  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <span className="w-8 shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      {children}
    </div>
  );
}
