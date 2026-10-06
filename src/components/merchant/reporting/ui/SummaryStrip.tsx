import type { ReactNode } from "react";

export interface SummaryItem {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
}

/** 3–4 compact facts above a table. Values are passed in; nothing is computed here. */
export default function SummaryStrip({
  items,
  loading,
}: {
  items: SummaryItem[];
  loading?: boolean;
}) {
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((it) => (
        <div
          key={it.label}
          className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm"
        >
          <dt className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            {it.icon && (
              <span
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600"
                aria-hidden
              >
                {it.icon}
              </span>
            )}
            {it.label}
          </dt>
          <dd className="mt-2 text-xl font-bold tabular-nums tracking-tight text-slate-900">
            {loading ? (
              <span className="inline-block h-6 w-20 animate-pulse rounded-md bg-slate-100 motion-reduce:animate-none" />
            ) : (
              it.value
            )}
          </dd>
          {it.hint && (
            <p className="mt-0.5 truncate text-xs text-slate-500">{it.hint}</p>
          )}
        </div>
      ))}
    </dl>
  );
}
