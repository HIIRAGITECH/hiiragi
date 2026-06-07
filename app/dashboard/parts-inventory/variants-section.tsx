"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import type { PartsInventoryVariant } from "@/lib/types";
import {
  createVariant,
  softDeleteVariant,
  updateVariant,
  type VariantFormState,
} from "./variants-actions";

type Props = {
  partId: string;
  initial: PartsInventoryVariant[];
};

// 部品編集ページに同居するセクション。
// 各 variant は独立した小フォームで個別に保存・削除する（部品本体フォームとは別系統）。
// 追加・更新・削除はいずれも server action 完了後に revalidatePath → router.refresh で
// 親 SSR から再取得し、initial が新しい配列で再描画される。
export default function VariantsSection({ partId, initial }: Props) {
  const [adding, setAdding] = useState(false);

  return (
    <section className="wos-card">
      <div className="wos-sec-label mb-1">車種別定価</div>
      <p className="mb-4 text-xs text-[var(--color-ink-light)]">
        この部品にぶら下げる「品番＋定価＋適合車種タグ」の組を登録します。受注の車種でヒットしたら、ここの品番・定価が明細に流れます（呼び出しUIは次ステップで実装）。
      </p>

      <div className="space-y-3">
        {initial.length === 0 && !adding && (
          <p className="text-sm text-[var(--color-ink-light)]">
            まだ登録されていません。「＋ 追加」から最初の組を作成してください。
          </p>
        )}

        {initial.map((v) => (
          <VariantCard key={v.id} variant={v} />
        ))}

        {adding ? (
          <NewVariantCard partId={partId} onDone={() => setAdding(false)} />
        ) : (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="wos-btn-ghost wos-btn-sm"
            >
              ＋ 追加
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

// 既存 variant 1 行ぶんの編集カード。defaultValue で初期値、保存で updateVariant。
function VariantCard({ variant }: { variant: PartsInventoryVariant }) {
  const router = useRouter();
  const updateAction = updateVariant.bind(null, variant.id);
  const [state, formAction, pending] = useActionState<
    VariantFormState,
    FormData
  >(updateAction, undefined);
  const [deleting, startDelete] = useTransition();
  const [savedFlash, setSavedFlash] = useState(false);

  // 保存成功時は親 SSR を再取得して initial を更新する。
  useEffect(() => {
    if (state && "success" in state) {
      setSavedFlash(true);
      router.refresh();
      const t = setTimeout(() => setSavedFlash(false), 1500);
      return () => clearTimeout(t);
    }
  }, [state, router]);

  function handleDelete() {
    const label = variant.part_number ?? "（品番なし）";
    if (!confirm(`「${label}」の組を削除しますか？（後から復元はできません）`)) {
      return;
    }
    startDelete(async () => {
      const r = await softDeleteVariant(variant.id);
      if ("error" in r) {
        alert(r.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <form
      action={formAction}
      className="border border-[var(--color-line)] bg-[var(--color-cream)] p-3 space-y-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="wos-label">品番</label>
          <input
            name="part_number"
            defaultValue={variant.part_number ?? ""}
            className="wos-input"
            placeholder="例: 3XV-23135-20"
          />
        </div>
        <div>
          <label className="wos-label">定価</label>
          <input
            name="list_price"
            type="number"
            min={0}
            step={1}
            defaultValue={variant.list_price ?? ""}
            className="wos-input text-right"
            placeholder="例: 5590"
          />
        </div>
      </div>

      <div>
        <label className="wos-label">適合車種</label>
        <VehicleTagsInput name="vehicle_tags" initial={variant.vehicle_tags} />
        <p className="mt-1 text-xs text-[var(--color-ink-light)]">
          Enter または カンマで確定 / × で削除 / Backspace で末尾削除
        </p>
      </div>

      {state && "error" in state && (
        <p role="alert" className="wos-alert warn">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending || deleting}
          className="wos-btn wos-btn-sm"
        >
          {pending ? "保存中…" : "更新"}
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={pending || deleting}
          className="wos-btn-danger wos-btn-sm"
        >
          {deleting ? "削除中…" : "削除"}
        </button>
        {savedFlash && (
          <span className="text-xs text-[var(--color-ink-light)]">保存しました</span>
        )}
      </div>
    </form>
  );
}

// 新規追加カード。成功したらフォームを閉じる（onDone）。
function NewVariantCard({
  partId,
  onDone,
}: {
  partId: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const createAction = createVariant.bind(null, partId);
  const [state, formAction, pending] = useActionState<
    VariantFormState,
    FormData
  >(createAction, undefined);

  useEffect(() => {
    if (state && "success" in state) {
      router.refresh();
      onDone();
    }
  }, [state, router, onDone]);

  return (
    <form
      action={formAction}
      className="border border-[var(--color-line)] bg-[var(--color-paper)] p-3 space-y-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="wos-label">品番</label>
          <input
            name="part_number"
            className="wos-input"
            placeholder="例: 3XV-23135-20"
            autoFocus
          />
        </div>
        <div>
          <label className="wos-label">定価</label>
          <input
            name="list_price"
            type="number"
            min={0}
            step={1}
            className="wos-input text-right"
            placeholder="例: 5590"
          />
        </div>
      </div>

      <div>
        <label className="wos-label">適合車種</label>
        <VehicleTagsInput name="vehicle_tags" initial={[]} />
        <p className="mt-1 text-xs text-[var(--color-ink-light)]">
          Enter または カンマで確定 / × で削除 / Backspace で末尾削除
        </p>
      </div>

      {state && "error" in state && (
        <p role="alert" className="wos-alert warn">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="wos-btn wos-btn-sm"
        >
          {pending ? "追加中…" : "この組を追加"}
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={pending}
          className="wos-btn-ghost wos-btn-sm"
        >
          キャンセル
        </button>
      </div>
    </form>
  );
}

// チップ表示 + 自由入力。Enter/カンマで確定、× で削除、Backspace（入力空のとき）で末尾削除。
// 送信時は hidden input に JSON 配列を入れる（サーバー側 pickStringArray と契約）。
function VehicleTagsInput({
  name,
  initial,
}: {
  name: string;
  initial: string[];
}) {
  const [tags, setTags] = useState<string[]>(initial);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function commit(raw: string) {
    const candidates = raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== "");
    if (candidates.length === 0) return;
    setTags((prev) => {
      const seen = new Set(prev);
      const next = [...prev];
      for (const c of candidates) {
        if (!seen.has(c)) {
          seen.add(c);
          next.push(c);
        }
      }
      return next;
    });
    setInput("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit(input);
      return;
    }
    if (e.key === "Backspace" && input === "" && tags.length > 0) {
      e.preventDefault();
      setTags((prev) => prev.slice(0, -1));
    }
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    // 末尾がカンマなら即確定（IME 中の偶発的カンマも拾えるよう onChange で）。
    if (v.endsWith(",")) {
      commit(v.slice(0, -1));
    } else {
      setInput(v);
    }
  }

  function onBlur() {
    if (input.trim() !== "") commit(input);
  }

  function remove(t: string) {
    setTags((prev) => prev.filter((x) => x !== t));
    inputRef.current?.focus();
  }

  return (
    <>
      <div
        className="flex flex-wrap gap-1.5 items-center min-h-[2.5rem] border border-[var(--color-line-strong)] bg-[var(--color-paper)] px-2 py-1.5 cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((t) => (
          <span
            key={t}
            className="wos-chip active inline-flex items-center gap-1.5"
          >
            <span>{t}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                remove(t);
              }}
              className="opacity-70 hover:opacity-100"
              aria-label={`${t} を削除`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          placeholder={tags.length === 0 ? "例: グース, GSX400 …" : ""}
          className="flex-1 min-w-[8rem] bg-transparent outline-none text-sm py-1"
        />
      </div>
      <input type="hidden" name={name} value={JSON.stringify(tags)} />
    </>
  );
}
