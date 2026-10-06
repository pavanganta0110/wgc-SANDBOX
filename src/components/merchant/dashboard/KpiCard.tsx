import type { ReactNode } from "react";
import DeltaPill from "./DeltaPill";
import Sparkline from "./Sparkline";
import type { MetricDelta } from "@/lib/reports/summaryMetrics";

export default function KpiCard({
  label,
  value,
  icon,
  delta,
  spark,
  comparedTo,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  delta: MetricDelta;
  spark?: number[];
  /** e.g. "vs previous 6 months" — only shown next to a delta pill. */
  comparedTo?: string;
}) {
  const hasSpark = spark && spark.length > 1 && spark.some((v) => v !== 0);
  return (
    <div className="wgc-fade-in group flex min-w-0 flex-col rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-shadow hover:shadow-[0_4px_16px_rgba(15,23,42,0.06)] motion-reduce:transition-none">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600" aria-hidden>
          {icon}
        </span>
        <h3 className="min-w-0 truncate text-sm font-medium text-slate-500" title={label}>
          {label}
        </h3>
      </div>
      <p className="mt-4 break-words text-[28px] font-bold leading-none tracking-tight text-slate-900 tabular-nums">{value}</p>
      <div className="mt-3 flex min-h-[36px] items-end justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <DeltaPill delta={delta} />
          {delta.direction !== "none" && comparedTo && <span className="text-xs text-slate-400">{comparedTo}</span>}
        </div>
        {hasSpark && <Sparkline values={spark!} />}
      </div>
    </div>
  );
}
