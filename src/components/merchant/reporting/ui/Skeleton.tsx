export function Block({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-2xl bg-slate-100 motion-reduce:animate-none ${className}`}
    />
  );
}

/** Placeholder rows that mirror a table, so loading never looks like blank space. */
export function TableSkeleton({
  rows = 8,
  cols = 5,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <tbody aria-hidden>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-slate-100 last:border-0">
          {Array.from({ length: cols }).map((__, c) => (
            <td key={c} className="px-4 py-3.5">
              <div
                className={`h-4 animate-pulse rounded bg-slate-100 motion-reduce:animate-none ${c === 0 ? "w-36" : c === cols - 1 ? "ml-auto w-16" : "w-24"}`}
              />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

/** Whole-page skeleton shared by the report routes' loading.tsx. */
export function ReportPageSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading report">
      <div className="space-y-3">
        <Block className="h-3 w-32" />
        <Block className="h-7 w-64" />
        <Block className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Block key={i} className="h-24" />
        ))}
      </div>
      <Block className="h-12" />
      <Block className="h-[26rem]" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
