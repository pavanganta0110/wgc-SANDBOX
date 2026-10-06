/** Skeleton placeholders: same footprint as the real cards, so nothing jumps. */
const bar = "animate-pulse rounded bg-slate-200/70 motion-reduce:animate-none";

export function KpiSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]" aria-hidden>
      <div className="flex items-center gap-2.5">
        <div className={`${bar} h-8 w-8 rounded-lg`} />
        <div className={`${bar} h-3.5 w-28`} />
      </div>
      <div className="mt-4 flex items-end justify-between">
        <div>
          <div className={`${bar} h-7 w-32`} />
          <div className={`${bar} mt-3 h-5 w-20 rounded-full`} />
        </div>
        <div className={`${bar} h-9 w-24`} />
      </div>
    </div>
  );
}

export function CardSkeleton({ height = 280 }: { height?: number }) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]" aria-hidden>
      <div className={`${bar} h-4 w-40`} />
      <div className={`${bar} mt-5 w-full rounded-xl`} style={{ height }} />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading dashboard">
      <div className="flex items-end justify-between">
        <div className="space-y-2">
          <div className={`${bar} h-7 w-72`} />
          <div className={`${bar} h-4 w-52`} />
        </div>
        <div className={`${bar} h-10 w-44 rounded-xl`} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <KpiSkeleton key={i} />
        ))}
      </div>
      <CardSkeleton height={280} />
      <div className="grid gap-4 md:grid-cols-2">
        <CardSkeleton height={160} />
        <CardSkeleton height={160} />
      </div>
      <span className="sr-only">Loading</span>
    </div>
  );
}
