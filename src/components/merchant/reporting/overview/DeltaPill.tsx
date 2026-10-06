import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { Delta } from "@/lib/reporting/reportingPeriod";

/** Change vs the comparison period. Arrow + sign + text, never color alone. */
export default function DeltaPill({ delta, vs }: { delta: Delta; vs: string }) {
  if (delta.percent === null) {
    return delta.direction === "up" ? (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600"
        title={`Nothing recorded in the ${vs}`}
      >
        New
      </span>
    ) : null;
  }
  const tone =
    delta.direction === "up"
      ? "bg-emerald-50 text-emerald-700"
      : delta.direction === "down"
        ? "bg-rose-50 text-rose-700"
        : "bg-slate-100 text-slate-600";
  const Icon =
    delta.direction === "up"
      ? ArrowUpRight
      : delta.direction === "down"
        ? ArrowDownRight
        : Minus;
  const sign = delta.direction === "up" ? "+" : "";
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${tone}`}
      title={`${sign}${delta.percent}% vs ${vs}`}
    >
      <Icon className="h-3 w-3" aria-hidden />
      <span className="sr-only">
        {delta.direction === "up"
          ? "Up"
          : delta.direction === "down"
            ? "Down"
            : "Unchanged"}{" "}
      </span>
      {sign}
      {delta.percent}%
    </span>
  );
}
