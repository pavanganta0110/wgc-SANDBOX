import { formatCents } from "@/lib/format";

export default function ProgressBar({
  raisedCents,
  goalAmountCents,
  donorCount,
}: {
  raisedCents: number;
  goalAmountCents: number | null;
  donorCount: number;
}) {
  const percent = goalAmountCents ? Math.min(100, Math.round((raisedCents / goalAmountCents) * 100)) : null;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-3xl font-bold text-slate-900">{formatCents(raisedCents)}</p>
        {goalAmountCents != null && <p className="text-sm text-slate-500">of {formatCents(goalAmountCents)} goal</p>}
      </div>
      {percent != null && (
        <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full rounded-full bg-wgc-gold-500 transition-all duration-700" style={{ width: `${percent}%` }} />
        </div>
      )}
      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <span>{donorCount} {donorCount === 1 ? "supporter" : "supporters"}</span>
        {percent != null && <span>{percent}% of goal</span>}
      </div>
    </div>
  );
}
