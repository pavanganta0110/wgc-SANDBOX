import type { ReactNode } from "react";
import InfoTip from "./InfoTip";

export default function KpiTile({
  label,
  value,
  icon,
  tip,
  hint,
  delta,
  spark,
  size = "md",
  className = "",
}: {
  label: string;
  value: string;
  icon: ReactNode;
  tip: string;
  hint?: ReactNode;
  delta?: ReactNode;
  spark?: ReactNode;
  size?: "md" | "lg";
  className?: string;
}) {
  const hero = size === "lg";
  return (
    <div
      className={`group relative flex flex-col rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm transition duration-200 hover:border-slate-300 hover:shadow-md motion-reduce:transition-none ${hero ? "sm:p-6" : ""} ${className}`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 ${hero ? "h-9 w-9" : "h-8 w-8"}`}
          aria-hidden
        >
          {icon}
        </span>
        <span className="text-xs font-semibold text-slate-500">
          {label}
          <InfoTip text={tip} label={label} />
        </span>
      </div>
      <div
        className={`mt-3 font-bold tracking-tight text-slate-900 tabular-nums ${hero ? "text-4xl sm:text-5xl" : "text-2xl"}`}
      >
        {value}
      </div>
      <div className="mt-1.5 flex min-h-[1.25rem] flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
        {delta}
        {hint && <span>{hint}</span>}
      </div>
      {spark && (
        <div className={`mt-auto pt-3 ${hero ? "max-w-md" : ""}`}>{spark}</div>
      )}
    </div>
  );
}
