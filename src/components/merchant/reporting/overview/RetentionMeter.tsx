import Link from "next/link";
import {
  CheckCircle2,
  AlertTriangle,
  CircleHelp,
  TrendingDown,
} from "lucide-react";
import { retentionTone } from "@/lib/reporting/reportingPeriod";
import InfoTip from "./InfoTip";

const TONES = {
  strong: {
    stroke: "#059669",
    text: "text-emerald-700",
    bg: "bg-emerald-50",
    label: "Strong",
    Icon: CheckCircle2,
    line: "Most of last year's donors are still giving.",
  },
  steady: {
    stroke: "#B45309",
    text: "text-amber-700",
    bg: "bg-amber-50",
    label: "Steady",
    Icon: AlertTriangle,
    line: "About half of last year's donors have given again.",
  },
  needs_attention: {
    stroke: "#BE123C",
    text: "text-rose-700",
    bg: "bg-rose-50",
    label: "Needs attention",
    Icon: TrendingDown,
    line: "Many of last year's donors haven't given again yet.",
  },
} as const;

export default function RetentionMeter({
  ratePercent,
  priorYearDonors,
  retained,
  lapsed,
  year,
}: {
  ratePercent: number | null;
  priorYearDonors: number;
  retained: number;
  lapsed: number;
  year: number;
}) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const known = ratePercent !== null;
  const tone = known ? TONES[retentionTone(ratePercent)] : null;
  const dash = known ? (Math.min(100, Math.max(0, ratePercent)) / 100) * c : 0;

  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:p-6">
      <div
        className="relative mx-auto h-36 w-36 shrink-0 sm:mx-0"
        role="img"
        aria-label={
          known
            ? `Donor retention ${Math.round(ratePercent)} percent`
            : "Donor retention not available yet"
        }
      >
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          <circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke="#E2E8F0"
            strokeWidth="10"
          />
          {known && (
            <circle
              cx="60"
              cy="60"
              r={r}
              fill="none"
              stroke={tone!.stroke}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${c}`}
              className="transition-[stroke-dasharray] duration-700 motion-reduce:transition-none"
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {known ? (
            <>
              <span className="text-3xl font-bold tabular-nums tracking-tight text-slate-900">
                {Math.round(ratePercent)}%
              </span>
              <span className="text-[11px] font-medium text-slate-500">
                retained
              </span>
            </>
          ) : (
            <CircleHelp className="h-8 w-8 text-slate-300" aria-hidden />
          )}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-bold text-slate-900">
            Donor retention
            <InfoTip
              label="Donor retention"
              text={`Of the donors who gave in ${year - 1}, the share who have also given in ${year}. Higher is better; around 45% is typical for churches and nonprofits.`}
            />
          </h4>
          {tone ? (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${tone.bg} ${tone.text}`}
            >
              <tone.Icon className="h-3 w-3" aria-hidden />
              {tone.label}
            </span>
          ) : (
            <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
              Not enough history yet
            </span>
          )}
        </div>
        {known ? (
          <>
            <p className="mt-2 text-sm text-slate-600">{tone!.line}</p>
            <p className="mt-1 text-sm text-slate-500">
              <span className="font-semibold tabular-nums text-slate-900">
                {retained.toLocaleString("en-US")}
              </span>{" "}
              of {priorYearDonors.toLocaleString("en-US")} donors who gave in{" "}
              {year - 1} have given again in {year}.{" "}
              {lapsed > 0 && (
                <>
                  <span className="font-semibold tabular-nums text-slate-900">
                    {lapsed.toLocaleString("en-US")}
                  </span>{" "}
                  haven&apos;t yet.
                </>
              )}
            </p>
            {lapsed > 0 && (
              <Link
                href="/merchant/reporting/lapsed"
                className="mt-2 inline-flex items-center gap-1 rounded text-sm font-semibold text-indigo-700 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                See who hasn&apos;t given again <span aria-hidden>→</span>
              </Link>
            )}
            <div className="mt-4 max-w-md">
              <div
                className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full"
                role="img"
                aria-label={`${retained} retained, ${lapsed} not yet given`}
              >
                {retained > 0 && (
                  <div
                    className="rounded-l-full"
                    style={{
                      width: `${(retained / priorYearDonors) * 100}%`,
                      background: tone!.stroke,
                    }}
                  />
                )}
                {lapsed > 0 && (
                  <div
                    className="rounded-r-full bg-slate-200"
                    style={{ width: `${(lapsed / priorYearDonors) * 100}%` }}
                  />
                )}
              </div>
              <div className="mt-1.5 flex justify-between text-xs text-slate-500">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-sm"
                    style={{ background: tone!.stroke }}
                    aria-hidden
                  />
                  Gave again · {retained.toLocaleString("en-US")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-sm bg-slate-200"
                    aria-hidden
                  />
                  Not yet · {lapsed.toLocaleString("en-US")}
                </span>
              </div>
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm text-slate-500">
            Retention compares this year&apos;s donors with last year&apos;s.
            Nobody gave in {year - 1}, so there&apos;s nothing to measure
            against yet. It will appear once you have a full year of giving.
          </p>
        )}
      </div>
    </div>
  );
}
