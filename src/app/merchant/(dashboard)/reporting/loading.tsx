/** Skeleton that mirrors the overview's layout so the page doesn't jump when data arrives. */
function Block({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-2xl bg-slate-100 motion-reduce:animate-none ${className}`}
    />
  );
}

export default function ReportingLoading() {
  return (
    <div className="space-y-8" role="status" aria-label="Loading reporting">
      <div className="flex flex-col gap-5 lg:flex-row lg:justify-between">
        <div className="space-y-3">
          <Block className="h-7 w-40" />
          <Block className="h-4 w-72" />
          <Block className="h-11 w-[28rem] max-w-full" />
        </div>
        <div className="flex gap-2">
          <Block className="h-10 w-36" />
          <Block className="h-10 w-24" />
          <Block className="h-10 w-32" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-12">
        <Block className="h-44 sm:col-span-3 lg:col-span-6" />
        <Block className="h-44 lg:col-span-2" />
        <Block className="h-44 lg:col-span-2" />
        <Block className="h-44 lg:col-span-2" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Block key={i} className="h-28" />
        ))}
      </div>
      <Block className="h-44" />
      <Block className="h-80" />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Block className="h-64" />
        <Block className="h-64" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
