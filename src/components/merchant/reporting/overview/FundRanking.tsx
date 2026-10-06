import Card, { EmptyNote } from "./Card";
import Tip from "./Tip";
import type { FundRow } from "./types";
import { SERIES } from "./tokens";
import { formatCents, percent } from "./format";

export default function FundRanking({ rows }: { rows: FundRow[] }) {
  const max = Math.max(...rows.map((r) => r.valueCents), 1);
  return (
    <Card title="Giving by fund" subtitle="Ranked by amount, before refunds">
      {rows.length === 0 ? (
        <EmptyNote
          title="No fund activity yet"
          body="Gifts that are assigned to a fund will be ranked here."
        />
      ) : (
        <ol className="space-y-3.5">
          {rows.map((r, i) => (
            <li key={r.label}>
              <Tip
                content={`${r.label}: ${formatCents(r.valueCents)} (${percent(r.sharePercent)} of fund giving)`}
                className="w-full"
              >
                <span className="block w-full">
                  <span className="flex items-baseline gap-2 text-sm">
                    <span className="w-5 text-xs font-semibold tabular-nums text-slate-500">
                      {r.isOther ? "" : i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-700">
                      {r.label}
                    </span>
                    <span className="font-bold tabular-nums text-slate-900">
                      {formatCents(r.valueCents)}
                    </span>
                    <span className="w-10 text-right text-xs tabular-nums text-slate-500">
                      {percent(r.sharePercent)}
                    </span>
                  </span>
                  <span className="mt-1.5 ml-7 block h-1.5 rounded-full bg-slate-100">
                    <span
                      className="block h-1.5 rounded-full"
                      style={{
                        width: `${Math.max((r.valueCents / max) * 100, 2)}%`,
                        background: r.isOther ? SERIES.other : SERIES.indigo,
                      }}
                    />
                  </span>
                </span>
              </Tip>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
