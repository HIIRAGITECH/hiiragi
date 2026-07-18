"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PartCategory } from "@/lib/types";
import {
  createPartCategory,
  deletePartCategory,
  movePartCategory,
  renamePartCategory,
} from "./actions";

type Props = { rows: PartCategory[] };

const LEVEL_LABEL: Record<number, string> = { 1: "大分類", 2: "中分類", 3: "小分類" };
const ADD_ROOT = "__root__";

export default function PartCategoriesManager({ rows }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // 追加入力を出している親（ADD_ROOT=大分類の新規、id=その配下の子の新規、null=非表示）。
  const [addingParent, setAddingParent] = useState<string | null>(null);
  const [addValue, setAddValue] = useState("");
  // 改名中のノード。
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // parent_id ごとに子をまとめる（並びは page 側で sort_order 済み）。
  const childrenOf = useMemo(() => {
    const map = new Map<string | null, PartCategory[]>();
    for (const r of rows) {
      const key = r.parent_id;
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    return map;
  }, [rows]);

  const roots = childrenOf.get(null) ?? [];

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function submitAdd(parentId: string | null) {
    const name = addValue.trim();
    if (!name) return;
    const res = await createPartCategory({ parentId, name });
    if ("error" in res) {
      alert(res.error);
      return;
    }
    setAddingParent(null);
    setAddValue("");
    refresh();
  }

  async function submitRename(id: string) {
    const name = editValue.trim();
    if (!name) return;
    const res = await renamePartCategory(id, name);
    if ("error" in res) {
      alert(res.error);
      return;
    }
    setEditingId(null);
    setEditValue("");
    refresh();
  }

  async function handleDelete(node: PartCategory) {
    const kids = countDescendants(node.id, childrenOf);
    const warn =
      kids > 0
        ? `「${node.name}」とその配下（中・小 ${kids} 件）をまとめて削除します。よろしいですか？`
        : `「${node.name}」を削除します。よろしいですか？`;
    if (!confirm(warn)) return;
    const res = await deletePartCategory(node.id);
    if ("error" in res) {
      alert(res.error);
      return;
    }
    refresh();
  }

  async function handleMove(id: string, direction: "up" | "down") {
    const res = await movePartCategory(id, direction);
    if ("error" in res) alert(res.error);
    else refresh();
  }

  function startAdd(parentId: string) {
    setEditingId(null);
    setAddingParent(parentId);
    setAddValue("");
  }
  function startEdit(node: PartCategory) {
    setAddingParent(null);
    setEditingId(node.id);
    setEditValue(node.name);
  }

  return (
    <div className="flex-1 overflow-auto bg-[var(--color-cream)]">
      <div className="px-4 sm:px-8 py-6 max-w-3xl">
        <div className="wos-card">
          {roots.length === 0 && addingParent !== ADD_ROOT ? (
            <p className="text-sm text-[var(--color-ink-light)] py-6 text-center">
              まだカテゴリがありません。「＋ 大分類を追加」から作成してください。
            </p>
          ) : (
            <ul className="space-y-1">
              {roots.map((node, idx) => (
                <CategoryNode
                  key={node.id}
                  node={node}
                  siblings={roots}
                  index={idx}
                  childrenOf={childrenOf}
                  pending={pending}
                  addingParent={addingParent}
                  addValue={addValue}
                  editingId={editingId}
                  editValue={editValue}
                  onAddValueChange={setAddValue}
                  onEditValueChange={setEditValue}
                  onStartAdd={startAdd}
                  onSubmitAdd={submitAdd}
                  onCancelAdd={() => setAddingParent(null)}
                  onStartEdit={startEdit}
                  onSubmitRename={submitRename}
                  onCancelEdit={() => setEditingId(null)}
                  onDelete={handleDelete}
                  onMove={handleMove}
                />
              ))}
            </ul>
          )}

          {/* 大分類の新規追加 */}
          <div className="mt-3 border-t border-[var(--color-line)] pt-3">
            {addingParent === ADD_ROOT ? (
              <InlineAdd
                placeholder="大分類の名前（例: 消耗品 / エンジン / メーカー別）"
                value={addValue}
                disabled={pending}
                onChange={setAddValue}
                onSubmit={() => submitAdd(null)}
                onCancel={() => setAddingParent(null)}
              />
            ) : (
              <button
                type="button"
                className="wos-btn wos-btn-sm"
                onClick={() => startAdd(ADD_ROOT)}
              >
                ＋ 大分類を追加
              </button>
            )}
          </div>
        </div>

        <p className="mt-3 text-xs text-[var(--color-ink-light)]">
          ※ カテゴリは大・中・小の最大3階層まで。小分類の下にはさらに階層を作れません。
          並び替えは同じ階層の中で ↑↓ で調整できます。
        </p>
      </div>
    </div>
  );
}

// 1ノード＋その子を再帰描画。level<3 のときだけ「子を追加」ボタンを出す（UIガード）。
function CategoryNode({
  node,
  siblings,
  index,
  childrenOf,
  pending,
  addingParent,
  addValue,
  editingId,
  editValue,
  onAddValueChange,
  onEditValueChange,
  onStartAdd,
  onSubmitAdd,
  onCancelAdd,
  onStartEdit,
  onSubmitRename,
  onCancelEdit,
  onDelete,
  onMove,
}: {
  node: PartCategory;
  siblings: PartCategory[];
  index: number;
  childrenOf: Map<string | null, PartCategory[]>;
  pending: boolean;
  addingParent: string | null;
  addValue: string;
  editingId: string | null;
  editValue: string;
  onAddValueChange: (v: string) => void;
  onEditValueChange: (v: string) => void;
  onStartAdd: (parentId: string) => void;
  onSubmitAdd: (parentId: string | null) => void;
  onCancelAdd: () => void;
  onStartEdit: (node: PartCategory) => void;
  onSubmitRename: (id: string) => void;
  onCancelEdit: () => void;
  onDelete: (node: PartCategory) => void;
  onMove: (id: string, direction: "up" | "down") => void;
}) {
  const kids = childrenOf.get(node.id) ?? [];
  const canAddChild = node.level < 3;
  const isEditing = editingId === node.id;
  const childLabel = LEVEL_LABEL[node.level + 1] ?? "";

  return (
    <li>
      <div className="flex items-center gap-2 py-1">
        {/* 並べ替え */}
        <div className="flex flex-col leading-none">
          <button
            type="button"
            className="wos-btn-ghost wos-btn-xs px-1"
            aria-label="上に移動"
            disabled={pending || index === 0}
            onClick={() => onMove(node.id, "up")}
          >
            ↑
          </button>
          <button
            type="button"
            className="wos-btn-ghost wos-btn-xs px-1"
            aria-label="下に移動"
            disabled={pending || index === siblings.length - 1}
            onClick={() => onMove(node.id, "down")}
          >
            ↓
          </button>
        </div>

        <span className="text-[10px] px-1.5 py-0.5 border border-[var(--color-line)] text-[var(--color-ink-light)] shrink-0">
          {LEVEL_LABEL[node.level]}
        </span>

        {isEditing ? (
          <InlineAdd
            placeholder="カテゴリ名"
            value={editValue}
            disabled={pending}
            confirmLabel="保存"
            onChange={onEditValueChange}
            onSubmit={() => onSubmitRename(node.id)}
            onCancel={onCancelEdit}
          />
        ) : (
          <>
            <span className="font-semibold text-[var(--color-ink)]">
              {node.name}
            </span>
            <div className="ml-auto flex items-center gap-1">
              {canAddChild &&
                (addingParent === node.id ? null : (
                  <button
                    type="button"
                    className="wos-btn-ghost wos-btn-xs"
                    onClick={() => onStartAdd(node.id)}
                  >
                    ＋ {childLabel}
                  </button>
                ))}
              <button
                type="button"
                className="wos-btn-ghost wos-btn-xs"
                onClick={() => onStartEdit(node)}
              >
                編集
              </button>
              <button
                type="button"
                className="wos-btn-danger wos-btn-xs"
                disabled={pending}
                onClick={() => onDelete(node)}
              >
                削除
              </button>
            </div>
          </>
        )}
      </div>

      {/* 子ノード＋子の追加入力を1段インデントで */}
      {(kids.length > 0 || addingParent === node.id) && (
        <ul className="ml-6 border-l border-[var(--color-line)] pl-3 space-y-1">
          {kids.map((child, i) => (
            <CategoryNode
              key={child.id}
              node={child}
              siblings={kids}
              index={i}
              childrenOf={childrenOf}
              pending={pending}
              addingParent={addingParent}
              addValue={addValue}
              editingId={editingId}
              editValue={editValue}
              onAddValueChange={onAddValueChange}
              onEditValueChange={onEditValueChange}
              onStartAdd={onStartAdd}
              onSubmitAdd={onSubmitAdd}
              onCancelAdd={onCancelAdd}
              onStartEdit={onStartEdit}
              onSubmitRename={onSubmitRename}
              onCancelEdit={onCancelEdit}
              onDelete={onDelete}
              onMove={onMove}
            />
          ))}
          {addingParent === node.id && (
            <li className="py-1">
              <InlineAdd
                placeholder={`${childLabel}の名前`}
                value={addValue}
                disabled={pending}
                onChange={onAddValueChange}
                onSubmit={() => onSubmitAdd(node.id)}
                onCancel={onCancelAdd}
              />
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

// 追加・改名の共通インライン入力。Enter で確定、Esc でキャンセル。
function InlineAdd({
  placeholder,
  value,
  disabled,
  confirmLabel = "追加",
  onChange,
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  value: string;
  disabled?: boolean;
  confirmLabel?: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-1">
      <input
        autoFocus
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSubmit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        className="wos-input flex-1 max-w-xs"
      />
      <button
        type="button"
        className="wos-btn wos-btn-xs"
        disabled={disabled || value.trim() === ""}
        onClick={onSubmit}
      >
        {confirmLabel}
      </button>
      <button
        type="button"
        className="wos-btn-ghost wos-btn-xs"
        onClick={onCancel}
      >
        キャンセル
      </button>
    </div>
  );
}

// 配下(子孫)件数。削除時の確認文言に使う。
function countDescendants(
  id: string,
  childrenOf: Map<string | null, PartCategory[]>,
): number {
  const kids = childrenOf.get(id) ?? [];
  let n = kids.length;
  for (const k of kids) n += countDescendants(k.id, childrenOf);
  return n;
}
