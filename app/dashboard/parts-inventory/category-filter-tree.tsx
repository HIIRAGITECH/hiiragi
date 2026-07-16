"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { PartCategory } from "@/lib/types";

// 部品カテゴリ 段階3: 部品在庫一覧の左に置く「読み取り専用」カテゴリツリー。
//   - 管理画面(part-categories-manager)の childrenOf＋再帰描画パターンを踏襲するが、
//     追加/改名/削除/並べ替えは持たない。クリックで絞り込みを選ぶだけ。
//   - 各ノードに件数バッジ（子孫含む件数）を出す。母集合は一覧が今表示している行セット
//     （include_deleted の状態を尊重）で、件数の算出は table 側から countOf として渡される。
//   - 選択は URL ?category=<id>（include_deleted と同じ流儀）。
//       null=すべて表示 / "none"=未分類 / それ以外=カテゴリid。
export const UNCATEGORIZED = "none";

type Props = {
  categories: PartCategory[];
  selected: string | null; // null=すべて表示 / "none"=未分類 / uuid=カテゴリ
  countOf: Map<string, number>; // カテゴリid → 子孫含む件数
  allCount: number;
  noneCount: number;
};

export default function CategoryFilterTree({
  categories,
  selected,
  countOf,
  allCount,
  noneCount,
}: Props) {
  const router = useRouter();

  const { childrenOf } = useMemo(() => {
    const childrenOf = new Map<string | null, PartCategory[]>();
    for (const c of categories) {
      const arr = childrenOf.get(c.parent_id) ?? [];
      arr.push(c);
      childrenOf.set(c.parent_id, arr);
    }
    return { childrenOf };
  }, [categories]);

  const roots = childrenOf.get(null) ?? [];

  // 選択を URL に反映（サーバー再フェッチはせず、選択の永続化＝リロードで保つのが目的）。
  function select(value: string | null) {
    const url = new URL(window.location.href);
    if (value === null) url.searchParams.delete("category");
    else url.searchParams.set("category", value);
    router.push(url.pathname + url.search);
  }

  return (
    <nav aria-label="カテゴリで絞り込み" className="text-sm">
      <div className="wos-label mb-2">カテゴリで絞り込み</div>
      <ul className="space-y-0.5">
        <FilterRow
          label="すべて表示"
          count={allCount}
          active={selected === null}
          bold
          onClick={() => select(null)}
        />
        <FilterRow
          label="未分類"
          count={noneCount}
          active={selected === UNCATEGORIZED}
          onClick={() => select(UNCATEGORIZED)}
        />
      </ul>

      <div className="my-2 border-t border-[var(--color-line)]" />

      <ul className="space-y-0.5">
        {roots.map((node) => (
          <CategoryTreeNode
            key={node.id}
            node={node}
            childrenOf={childrenOf}
            selected={selected}
            countOf={countOf}
            onSelect={select}
          />
        ))}
      </ul>
    </nav>
  );
}

function CategoryTreeNode({
  node,
  childrenOf,
  selected,
  countOf,
  onSelect,
}: {
  node: PartCategory;
  childrenOf: Map<string | null, PartCategory[]>;
  selected: string | null;
  countOf: Map<string, number>;
  onSelect: (value: string) => void;
}) {
  const kids = childrenOf.get(node.id) ?? [];
  return (
    <li>
      <FilterRow
        label={node.name}
        count={countOf.get(node.id) ?? 0}
        active={selected === node.id}
        onClick={() => onSelect(node.id)}
      />
      {kids.length > 0 && (
        <ul className="ml-3 border-l border-[var(--color-line)] pl-2 space-y-0.5">
          {kids.map((child) => (
            <CategoryTreeNode
              key={child.id}
              node={child}
              childrenOf={childrenOf}
              selected={selected}
              countOf={countOf}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function FilterRow({
  label,
  count,
  active,
  bold,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  bold?: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`flex w-full items-center gap-2 px-2 py-1 text-left transition-colors ${
          active
            ? "bg-[var(--color-cream)] text-[var(--color-ink)] font-semibold"
            : "text-[var(--color-ink-mid)] hover:bg-[var(--color-cream)]"
        }`}
      >
        <span className={`min-w-0 flex-1 truncate ${bold ? "font-semibold" : ""}`}>
          {label}
        </span>
        <span
          className={`shrink-0 text-xs tabular-nums ${
            count > 0
              ? "text-[var(--color-ink-light)]"
              : "text-[var(--color-line-strong)]"
          }`}
        >
          {count}
        </span>
      </button>
    </li>
  );
}
