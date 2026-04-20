"use client";

import { useActionState } from "react";
import type { FormState } from "../actions";

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  initialUrl: string | null;
};

const inputClass =
  "flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-50 dark:focus:ring-zinc-50";

export default function PhotoFolderForm({ action, initialUrl }: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    undefined,
  );

  return (
    <form action={formAction} className="space-y-3">
      {initialUrl && (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            登録URL:{" "}
          </span>
          <a
            href={initialUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-50"
          >
            {initialUrl} ↗
          </a>
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="url"
          name="photo_folder_url"
          defaultValue={initialUrl ?? ""}
          placeholder="https://drive.google.com/drive/folders/..."
          className={inputClass}
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {pending ? "保存中..." : "保存"}
        </button>
      </div>

      {state?.error && (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
        >
          {state.error}
        </p>
      )}
    </form>
  );
}
