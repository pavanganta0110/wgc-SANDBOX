import Link from "next/link";
import { ArrowRight, HeartHandshake } from "lucide-react";
import { formatCents } from "@/lib/format";
import type { SourceTotals } from "@/lib/reports/moneySources";
import { SOURCE_COLORS } from "./chartUtils";

/**
 * "Where your donations came from": one stacked bar plus a legend that lists
 * every amount (the legend is the text alternative, and it carries the values
 * for the two lighter hues). Numbers come from getSourceTotals, the same SQL
 * classification as the Insights page.
 */
export default function SourcesCard({ totals, insightsHref }: { totals: SourceTotals; insightsHref: string }) {
  const rows = [
    { key: "givingPages", label: "Giving pages", color: SOURCE_COLORS.givingPages, cents: totals.givingPages.totalCents },
    { key: "events", label: "Events", color: SOURCE_COLORS.events, cents: totals.events.totalCents },
    { key: "campaigns", label: "Campaigns", color: SOURCE_COLORS.campaigns, cents: totals.campaigns.totalCents },
    { key: "pledges", label: "Pledges", color: SOURCE_COLORS.pledges, cents: totals.pledges.totalCents },
    ...(totals.otherCents > 0 ? [{ key: "other", label: "Other", color: SOURCE_COLORS.other, cents: totals.otherCents }] : []),
  ];
  const total = totals.totalCents;
  const share = (cents: number) => (total > 0 ? (cents / total) * 100 : 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Where your donations came from</h2>
          <p className="mt-0.5 text-xs text-slate-500">By source, for the selected period</p>
        </div>
        <p className="text-lg font-bold text-slate-900 tabular-nums">{formatCents(total)}</p>
      </div>

      {total <= 0 ? (
        <div className="mt-5 flex flex-1 flex-col items-center justify-center gap-3 rounded-xl bg-slate-50 px-4 py-8 text-center">
          <HeartHandshake className="h-5 w-5 text-slate-400" aria-hidden />
          <p className="text-sm text-slate-600">No donations yet. Share a giving page to see where gifts come from.</p>
          <Link
            href="/merchant/giving-links"
            className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          >
            Open giving pages
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-5 flex h-3 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`Donations by source: ${rows.map((r) => `${r.label} ${formatCents(r.cents)}`).join(", ")}`}>
            {rows
              .filter((r) => r.cents > 0)
              .map((r) => (
                <div key={r.key} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${Math.max(share(r.cents), 1.5)}%`, background: r.color }} title={`${r.label}: ${formatCents(r.cents)}`} />
              ))}
          </div>
          <ul className="mt-5 space-y-2.5">
            {rows.map((r) => (
              <li key={r.key} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2 text-slate-600">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: r.color }} aria-hidden />
                  <span className="truncate">{r.label}</span>
                </span>
                <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
                  <span className="font-semibold text-slate-900">{formatCents(r.cents)}</span>
                  <span className="w-10 text-right text-xs text-slate-400">{share(r.cents).toFixed(0)}%</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <Link
        href={insightsHref}
        className="mt-auto inline-flex items-center gap-1 pt-5 text-sm font-semibold text-indigo-600 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 rounded"
      >
        See the full breakdown
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}
