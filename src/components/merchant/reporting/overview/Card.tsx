import type { ReactNode } from "react";

export default function Card({
  title,
  subtitle,
  children,
  className = "",
  action,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section
      className={`rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm sm:p-6 ${className}`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-bold text-slate-900">{title}</h4>
          {subtitle && (
            <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyNote({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex min-h-[8rem] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center">
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      <p className="mt-1 max-w-xs text-xs text-slate-500">{body}</p>
    </div>
  );
}
