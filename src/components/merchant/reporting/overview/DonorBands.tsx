import Card, { EmptyNote } from "./Card";
import Tip from "./Tip";
import type { BandRow } from "./types";
import { SERIES } from "./tokens";
import { percent } from "./format";

export default function DonorBands({ rows }: { rows: BandRow[] }) {
  const total = rows.reduce((s, r) => s + r.donorCount, 0);
  const max = Math.max(...rows.map((r) => r.donorCount), 1);
  return (
    <Card title="Donor distribution" subtitle="Donors by lifetime giving">
      {total === 0 ? (
        <EmptyNote
          title="No donors yet"
          body="Donors will be grouped by how much they've given over time."
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.label}>
              <Tip
                content={`${r.donorCount.toLocaleString("en-US")} donor${r.donorCount === 1 ? "" : "s"} (${percent(r.sharePercent)} of donors) have given ${r.label} in total`}
                className="w-full"
              >
                <span className="block w-full">
                  <span className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium text-slate-700 tabular-nums">
                      {r.label}
                    </span>
                    <span className="tabular-nums text-slate-900">
                      <span className="font-bold">
                        {r.donorCount.toLocaleString("en-US")}
                      </span>
                      <span className="ml-1.5 text-xs text-slate-500">
                        {percent(r.sharePercent)}
                      </span>
                    </span>
                  </span>
                  <span className="mt-1.5 block h-1.5 w-full rounded-full bg-slate-100">
                    <span
                      className="block h-1.5 rounded-full"
                      style={{
                        width:
                          r.donorCount === 0
                            ? 0
                            : `${Math.max((r.donorCount / max) * 100, 3)}%`,
                        background: SERIES.indigo,
                      }}
                    />
                  </span>
                </span>
              </Tip>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
