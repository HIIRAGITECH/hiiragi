"use client";

import { useMemo, useState } from "react";
import type { PartCategory } from "@/lib/types";

// 部品カテゴリ 段階2: 大→中→小のカスケード選択。
//   - テナントが作った part_categories（最大3階層）から辿って選ぶ。
//   - 途中階層で確定できる（大だけ／大中だけ）。何も選ばなければ未分類(null)。
//   - 実際に保存されるのは「選んだ末端の id」。hidden input name="category_id" で form に送る。
//   - 編集時は initialCategoryId から選択パス（大・中・小）を復元する。
type Props = {
  categories: PartCategory[];
  initialCategoryId: string | null;
};

export default function CategorySelect({
  categories,
  initialCategoryId,
}: Props) {
  const { byId, childrenOf } = useMemo(() => {
    const byId = new Map<string, PartCategory>();
    const childrenOf = new Map<string | null, PartCategory[]>();
    for (const c of categories) {
      byId.set(c.id, c);
      const arr = childrenOf.get(c.parent_id) ?? [];
      arr.push(c);
      childrenOf.set(c.parent_id, arr);
    }
    return { byId, childrenOf };
  }, [categories]);

  // initialCategoryId から祖先を辿って [大, 中, 小] の初期選択を作る。
  const initialPath = useMemo(() => {
    const path: (string | null)[] = [null, null, null];
    let cur = initialCategoryId ? byId.get(initialCategoryId) : undefined;
    // 末端から親へ登り、level に応じて配置する。
    while (cur) {
      path[cur.level - 1] = cur.id;
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
    }
    return path;
  }, [initialCategoryId, byId]);

  const [big, setBig] = useState<string | null>(initialPath[0]);
  const [mid, setMid] = useState<string | null>(initialPath[1]);
  const [small, setSmall] = useState<string | null>(initialPath[2]);

  const roots = childrenOf.get(null) ?? [];
  const mids = big ? childrenOf.get(big) ?? [] : [];
  const smalls = mid ? childrenOf.get(mid) ?? [] : [];

  // 実際に保存する末端 id。深い方を優先。何も選ばなければ null（未分類）。
  const effectiveId = small ?? mid ?? big ?? "";

  return (
    <div>
      <span className="wos-label">
        カテゴリ{" "}
        <span className="text-xs text-[var(--color-ink-light)]">（任意）</span>
      </span>
      {/* 保存される値は末端 id。未分類は空文字 → サーバーで null 扱い。 */}
      <input type="hidden" name="category_id" value={effectiveId} />

      {roots.length === 0 ? (
        <p className="text-xs text-[var(--color-ink-light)]">
          カテゴリが未登録です。「部品カテゴリ」画面で作成すると、ここで選べます。
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-3">
          {/* 大分類 */}
          <select
            aria-label="大分類"
            value={big ?? ""}
            onChange={(e) => {
              const v = e.target.value || null;
              setBig(v);
              setMid(null);
              setSmall(null);
            }}
            className="wos-input"
          >
            <option value="">未分類</option>
            {roots.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {/* 中分類（大に子があるときだけ有効） */}
          <select
            aria-label="中分類"
            value={mid ?? ""}
            disabled={!big || mids.length === 0}
            onChange={(e) => {
              const v = e.target.value || null;
              setMid(v);
              setSmall(null);
            }}
            className="wos-input disabled:opacity-40"
          >
            <option value="">
              {mids.length === 0 ? "（中分類なし）" : "（大分類まで）"}
            </option>
            {mids.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {/* 小分類（中に子があるときだけ有効） */}
          <select
            aria-label="小分類"
            value={small ?? ""}
            disabled={!mid || smalls.length === 0}
            onChange={(e) => setSmall(e.target.value || null)}
            className="wos-input disabled:opacity-40"
          >
            <option value="">
              {smalls.length === 0 ? "（小分類なし）" : "（中分類まで）"}
            </option>
            {smalls.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <p className="mt-1 text-xs text-[var(--color-ink-light)]">
        大→中→小とたどって選べます。途中まででも確定できます（未選択は未分類）。
      </p>
    </div>
  );
}
