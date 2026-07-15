function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse bg-slate-100 rounded-xl ${className}`} />;
}

export default function DonorsLoading() {
  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <SkeletonBlock className="h-6 w-24" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-20" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <SkeletonBlock className="lg:col-span-2 h-64" />
        <SkeletonBlock className="h-64" />
      </div>
      <SkeletonBlock className="h-10 w-full mb-4" />
      <SkeletonBlock className="h-96 w-full" />
    </div>
  );
}
