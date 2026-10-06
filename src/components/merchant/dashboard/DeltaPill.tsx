import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import type { MetricDelta } from "@/lib/reports/summaryMetrics";

const TONE: Record<MetricDelta["tone"], string> = {
  good: "bg-emerald-50 text-[#006300] ring-emerald-100",
  bad: "bg-red-50 text-red-700 ring-red-100",
  neutral: "bg-slate-100 text-slate-600 ring-slate-200/70",
};

/**
 * Period-over-period pill. Tone follows meaning (more disputes = red), and
 * the arrow plus signed text carry the direction, so colour is never the
 * only cue.
 */
export default function DeltaPill({ delta }: { delta: MetricDelta }) {
  if (delta.direction === "none") return null;
  const Icon = delta.direction === "up" ? ArrowUpRight : delta.direction === "down" ? ArrowDownRight : Minus;
  const word = delta.direction === "up" ? "Up" : delta.direction === "down" ? "Down" : "No change";
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-inset ${TONE[delta.tone]}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {delta.label}
      <span className="sr-only"> ({word} versus the previous period)</span>
    </span>
  );
}
