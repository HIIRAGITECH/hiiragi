"use client";

type Props = {
  action: (formData: FormData) => void;
  hidden: Record<string, string>;
  confirmMessage: string;
  label: string;
  className?: string;
};

export default function DeleteButton({
  action,
  hidden,
  confirmMessage,
  label,
  className,
}: Props) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
    >
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button
        type="submit"
        className={
          className ??
          "rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700 transition-colors hover:bg-red-50 dark:border-red-900 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950/30"
        }
      >
        {label}
      </button>
    </form>
  );
}
