import Card, { EmptyNote } from "./Card";
import Tip from "./Tip";
import type { MixRow } from "./types";
import { METHOD_COLOR } from "./tokens";
import { formatCents, percent } from "./format";

export default function MethodMix({ rows }: { rows: MixRow[] }) {
  const total = rows.reduce((s, r) => s + r.valueCents, 0);
  const payments = rows.reduce((s, r) => s + r.count, 0);
  const lead = [...rows].sort((a, b) => b.valueCents - a.valueCents)[0];
  return (
    <Card
      title="Payment methods"
      subtitle="Where gifts came from, before refunds"
    >
      {total === 0 ? (
        <EmptyNote
          title="No payments in this period"
          body="Card, bank and external gifts will be split out here."
        />
      ) : (
        <>
          <div
            className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full"
            role="img"
            aria-label={rows
              .map((r) => `${r.label} ${percent(r.sharePercent)}`)
              .join(", ")}
          >
            {rows
              .filter((r) => r.valueCents > 0)
              .map((r) => (
                <div
                  key={r.key}
                  style={{
                    width: `${r.sharePercent}%`,
                    background: METHOD_COLOR[r.key],
                  }}
                  className="first:rounded-l-full last:rounded-r-full"
                />
              ))}
          </div>
          <ul className="mt-4 space-y-2.5">
            {rows.map((r) => (
              <li key={r.key}>
                <Tip
                  content={`${r.count.toLocaleString("en-US")} payment${r.count === 1 ? "" : "s"} · ${formatCents(r.valueCents)}`}
                  className="w-full"
                >
                  <span
                    className={`flex w-full items-center gap-2 text-sm ${r.valueCents === 0 ? "opacity-60" : ""}`}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ background: METHOD_COLOR[r.key] }}
                      aria-hidden
                    />
                    <span className="font-medium text-slate-700">
                      {r.label}
                    </span>
                    <span className="ml-auto font-bold tabular-nums text-slate-900">
                      {formatCents(r.valueCents)}
                    </span>
                    <span className="w-10 text-right text-xs tabular-nums text-slate-500">
                      {percent(r.sharePercent)}
                    </span>
                  </span>
                </Tip>
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">{lead.label}</span>{" "}
            leads with {percent(lead.sharePercent)} of giving across{" "}
            {payments.toLocaleString("en-US")} payment
            {payments === 1 ? "" : "s"}.
          </p>
        </>
      )}
    </Card>
  );
}
