import Link from "next/link";
import type { ReactNode } from "react";

/** Friendly empty state with a clear next step. */
export default function EmptyState({
  icon,
  title,
  body,
  actionHref,
  actionLabel,
  onAction,
}: {
  icon?: ReactNode;
  title: string;
  body: string;
  actionHref?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const cls =
    "mt-4 inline-flex h-9 items-center rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white outline-none transition hover:bg-indigo-700 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 motion-reduce:transition-none";
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && (
        <span
          className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600"
          aria-hidden
        >
          {icon}
        </span>
      )}
      <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{body}</p>
      {actionLabel && actionHref && (
        <Link href={actionHref} className={cls}>
          {actionLabel}
        </Link>
      )}
      {actionLabel && onAction && (
        <button type="button" onClick={onAction} className={cls}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
