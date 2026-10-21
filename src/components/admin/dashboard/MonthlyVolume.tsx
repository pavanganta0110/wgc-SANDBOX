import Card, { EmptyNote } from "@/components/merchant/reporting/overview/Card";
import Tip from "@/components/merchant/reporting/overview/Tip";
import { SERIES } from "@/components/merchant/reporting/overview/tokens";
import { compactMoney, formatCents } from "@/components/merchant/reporting/overview/format";

export interface MonthRow {
  month: string;
  cardCents: number;
  achCents: number;
  otherCents: number;
  count: number;
}

const LEGEND = [
  { label: "Card", color: SERIES.indigo },
  { label: "ACH", color: SERIES.teal },
];

/** Stacked card/ACH columns for the last 12 months. Server-rendered; tooltips are CSS-only. */
export default function MonthlyVolume({ rows }: { rows: MonthRow[] }) {
  const totals = rows.map((r) => r.cardCents + r.achCents + r.otherCents);
  const max = Math.max(...totals, 0);
  const sum = totals.reduce((s, v) => s + v, 0);
  const peak = totals.indexOf(max);

  return (
    <Card
      title="Processed by month"
      subtitle={`Last 12 months · ${formatCents(sum)} total`}
      action={
        <div className="flex items-center gap-3 text-xs text-slate-500">
          {LEGEND.map((l) => (
            <span key={l.label} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: l.color }} aria-hidden />
              {l.label}
            </span>
          ))}
        </div>
      }
    >
      {sum === 0 ? (
        <EmptyNote title="Nothing processed in the last 12 months" body="Monthly card and ACH volume across all merchants will chart here." />
      ) : (
        <>
          <div
            className="flex h-56 items-end gap-1.5 border-b border-slate-200 sm:gap-2"
            role="img"
            aria-label={`Processed volume by month. Best month ${rows[peak].month} at ${formatCents(max)}.`}
          >
            {rows.map((r, i) => {
              const h = max > 0 ? (totals[i] / max) * 100 : 0;
              return (
                <Tip
                  key={r.month}
                  className="flex h-full min-w-0 flex-1 items-end"
                  content={
                    <span className="block text-left">
                      <span className="block font-bold">{r.month}</span>
                      <span className="block">Total {formatCents(totals[i])}</span>
                      <span className="block">Card {formatCents(r.cardCents)}</span>
                      <span className="block">ACH {formatCents(r.achCents)}</span>
                      {r.otherCents > 0 && <span className="block">Unclassified {formatCents(r.otherCents)}</span>}
                      <span className="block text-slate-300">{r.count.toLocaleString("en-US")} payments</span>
                    </span>
                  }
                >
                  <span
                    className="flex w-full flex-col-reverse overflow-hidden rounded-t-md transition hover:opacity-80 motion-reduce:transition-none"
                    style={{ height: `${Math.max(h, totals[i] > 0 ? 2 : 0)}%` }}
                  >
                    <span style={{ flexGrow: r.cardCents, background: SERIES.indigo }} />
                    <span style={{ flexGrow: r.achCents, background: SERIES.teal }} />
                    <span style={{ flexGrow: r.otherCents, background: SERIES.other }} />
                  </span>
                </Tip>
              );
            })}
          </div>
          <div className="mt-2 flex gap-1.5 sm:gap-2">
            {rows.map((r, i) => (
              <span key={r.month} className="min-w-0 flex-1 truncate text-center text-[11px] text-slate-500">
                <span className={i % 2 === 1 ? "hidden sm:inline" : ""}>{r.month.split(" ")[0]}</span>
              </span>
            ))}
          </div>
          <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
            Best month: <span className="font-semibold text-slate-700">{rows[peak].month}</span> at{" "}
            <span className="font-semibold text-slate-700">{compactMoney(max)}</span>.
          </p>
        </>
      )}
    </Card>
  );
}
