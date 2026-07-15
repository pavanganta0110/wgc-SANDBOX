function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse bg-slate-100 rounded-xl ${className}`} />;
}

export default function DonorProfileLoading() {
  return (
    <div>
      <SkeletonBlock className="h-5 w-32 mb-4" />
      <SkeletonBlock className="h-48 w-full mb-6" />
      <SkeletonBlock className="h-10 w-full mb-6" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <SkeletonBlock className="h-40 w-full" />
          <SkeletonBlock className="h-64 w-full" />
        </div>
        <div className="space-y-6">
          <SkeletonBlock className="h-40 w-full" />
          <SkeletonBlock className="h-32 w-full" />
        </div>
      </div>
    </div>
  );
}
