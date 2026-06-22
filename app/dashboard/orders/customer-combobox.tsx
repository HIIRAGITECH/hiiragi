"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CustomerOption } from "./order-form";

// 顧客選択コンボボックス（検索で絞り込みながら選ぶ）。
// 既存の <select name="customer_id"> を置き換える。選択結果は hidden input で
// 同じ name="customer_id" として送信するため、サーバ側アクションは変更不要。
//
// 挙動:
//   - テキスト入力で顧客名をインクリメンタル絞り込み（全半角・大小を吸収）
//   - ↑↓で候補移動・Enterで確定・Escで閉じる・外側クリックで閉じる
//   - 閉じているときは選択中の顧客名を表示。フォーカスすると全選択して再検索可能
//   - 候補ゼロなら「該当なし」を表示

// 全半角・大小・カナのゆれをある程度吸収して比較するための正規化。
function normalize(s: string): string {
  return s.toLowerCase().normalize("NFKC");
}

type Props = {
  customers: CustomerOption[];
  value: string; // 選択中の顧客 id（未選択は ""）
  onChange: (id: string) => void;
  inputId?: string; // <label htmlFor> 用
  required?: boolean;
};

export default function CustomerCombobox({
  customers,
  value,
  onChange,
  inputId,
  required,
}: Props) {
  const selected = customers.find((c) => c.id === value) ?? null;

  const [query, setQuery] = useState(selected?.name ?? "");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  // 選択が外部要因（編集画面の初期値・車両追加後など）で変わったら表示も追従。
  // 入力中（open）はユーザーのタイプを尊重して上書きしない。
  useEffect(() => {
    if (!open) setQuery(selected?.name ?? "");
  }, [selected?.name, open]);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    // 選択中の名前そのものを表示しているだけのとき（検索していない）は全件出す。
    if (!q || q === normalize(selected?.name ?? "")) return customers;
    return customers.filter((c) => normalize(c.name).includes(q));
  }, [customers, query, selected?.name]);

  // 外側クリックで閉じる
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        close();
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function openMenu() {
    setHighlight(Math.max(0, filtered.findIndex((c) => c.id === value)));
    setOpen(true);
  }

  function close() {
    setOpen(false);
    // 確定せず閉じたら、表示は選択中の顧客名に戻す（選択は維持）。
    setQuery(selected?.name ?? "");
  }

  function pick(c: CustomerOption) {
    onChange(c.id);
    setQuery(c.name);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) return openMenu();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      // 候補が開いているときは Enter で確定（フォーム送信を防ぐ）
      if (open && filtered[highlight]) {
        e.preventDefault();
        pick(filtered[highlight]);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        close();
      }
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      {/* 送信値。required はネイティブには効かせず（hidden不可）、サーバ側で検証済み */}
      <input type="hidden" name="customer_id" value={value} />
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        required={required}
        className="wos-input"
        placeholder="顧客名で検索して選択…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlight(0);
          if (!open) setOpen(true);
        }}
        onFocus={(e) => {
          openMenu();
          e.target.select();
        }}
        onKeyDown={onKeyDown}
      />

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-auto border border-[var(--color-line-strong)] bg-[var(--color-paper)] shadow-lg"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-[var(--color-ink-light)]">
              該当する顧客がありません
            </li>
          ) : (
            filtered.map((c, i) => {
              const isSel = c.id === value;
              const isHi = i === highlight;
              return (
                <li
                  key={c.id}
                  role="option"
                  aria-selected={isSel}
                  // onMouseDown（onClickより先に発火）で input の blur 前に確定する
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(c);
                  }}
                  onMouseEnter={() => setHighlight(i)}
                  className={`cursor-pointer px-3 py-2.5 text-sm ${
                    isHi
                      ? "bg-[var(--color-cream)] text-[var(--color-ink)]"
                      : "text-[var(--color-ink)]"
                  }`}
                >
                  <span className={isSel ? "font-semibold" : ""}>{c.name}</span>
                  {isSel && (
                    <span
                      aria-hidden
                      className="ml-2 text-[10px] text-[var(--color-accent)]"
                    >
                      選択中
                    </span>
                  )}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
