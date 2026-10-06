"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { useChartWidth } from "./useChartWidth";
import { CHART_BLUE, INK, niceTicks, labelIndices } from "./chartUtils";
import type { DonorGrowthBucket } from "@/lib/reports/dashboardHome";

// New donors carry the chart's one accent hue; returning donors recede in a
// neutral, so the eye lands on growth. A legend is always shown (2 series).
const RETURNING = "#c3c2b7";

/**
 * Stacked columns, new vs returning donors per period. Marks follow the
 * dataviz spec: <= 24px wide, 4px rounded data end, 2px surface gap between
 * stacked segments, each column its own hover/focus target.
 */
export default function DonorGrowthChart({ data }: { data: DonorGrowthBucket[] }) {
  const { ref, width } = useChartWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const hasData = data.some((d) => d.newDonors + d.returningDonors > 0);
  const height = 200;
  const pad = { top: 20, right: 8, bottom: 26, left: 32 };
  const plotW = Math.max(0, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;
  const totals = data.map((d) => d.newDonors + d.returningDonors);
  const { ticks, top } = niceTicks(Math.max(...totals, 0), 3);
  const band = data.length ? plotW / data.length : 0;
  const barW = Math.min(24, band * 0.62);
  const y = (v: number) => pad.top + plotH - (v / top) * plotH;
  const xLabels = labelIndices(data.length, plotW, 56);
  const base = pad.top + plotH;
  const GAP = 2;

  const totalNew = data.reduce((s, d) => s + d.newDonors, 0);
  const summary = `Donor growth. ${totalNew} new donors across ${data.length} periods.`;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Donor growth</h2>
          <p className="mt-0.5 text-xs text-slate-500">New and returning donors per period</p>
        </div>
        <ul className="flex items-center gap-4 text-xs text-slate-600">
          <li className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_BLUE }} aria-hidden /> New
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: RETURNING }} aria-hidden /> Returning
          </li>
        </ul>
      </div>

      {!hasData ? (
        <div className="mt-5 flex flex-1 flex-col items-center justify-center gap-2 rounded-xl bg-slate-50 px-4 py-8 text-center" style={{ minHeight: 160 }}>
          <UserPlus className="h-5 w-5 text-slate-400" aria-hidden />
          <p className="text-sm text-slate-600">No donor activity in this period yet.</p>
        </div>
      ) : (
        <div ref={ref} className="relative mt-4" style={{ minHeight: height }}>
          {width > 0 && (
            <svg width={width} height={height} className="wgc-fade-in block" role="img" aria-label={summary}>
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? INK.axis : INK.grid} strokeWidth={1} />
                  <text x={pad.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={10.5} fill={INK.muted} className="tabular-nums">
                    {t}
                  </text>
                </g>
              ))}
              {data.map((d, i) => {
                const cx = pad.left + band * i + band / 2;
                const x0 = cx - barW / 2;
                const hNew = base - y(d.newDonors);
                const hRet = base - y(d.returningDonors);
                const dim = active != null && active !== i ? 0.45 : 1;
                // Returning sits at the base (square), new stacks on top (rounded data end).
                const retTop = base - hRet;
                const newBottom = d.returningDonors > 0 ? retTop - GAP : base;
                const newTop = newBottom - hNew;
                const r = Math.min(4, barW / 2);
                return (
                  <g key={d.label + i}>
                    <rect
                      x={pad.left + band * i}
                      y={pad.top}
                      width={band}
                      height={plotH}
                      fill="transparent"
                      tabIndex={0}
                      aria-label={`${d.label}: ${d.newDonors} new, ${d.returningDonors} returning`}
                      className="outline-none"
                      onPointerEnter={() => setActive(i)}
                      onPointerLeave={() => setActive(null)}
                      onFocus={() => setActive(i)}
                      onBlur={() => setActive(null)}
                    />
                    <g opacity={dim} style={{ transition: "opacity 120ms" }} pointerEvents="none">
                      {d.returningDonors > 0 && (
                        <path
                          d={
                            d.newDonors > 0
                              ? `M${x0},${base} V${retTop} H${x0 + barW} V${base} Z`
                              : `M${x0},${base} V${retTop + r} Q${x0},${retTop} ${x0 + r},${retTop} H${x0 + barW - r} Q${x0 + barW},${retTop} ${x0 + barW},${retTop + r} V${base} Z`
                          }
                          fill={RETURNING}
                        />
                      )}
                      {d.newDonors > 0 && (
                        <path
                          d={`M${x0},${newBottom} V${newTop + r} Q${x0},${newTop} ${x0 + r},${newTop} H${x0 + barW - r} Q${x0 + barW},${newTop} ${x0 + barW},${newTop + r} V${newBottom} Z`}
                          fill={CHART_BLUE}
                        />
                      )}
                    </g>
                    {xLabels.has(i) && (
                      <text x={cx} y={height - 8} textAnchor="middle" fontSize={10.5} fill={INK.muted}>
                        {d.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          )}
          {active != null && width > 0 && (
            <div
              className="pointer-events-none absolute z-10 min-w-[128px] rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 shadow-lg"
              style={{
                left: Math.min(Math.max(pad.left + band * active + band / 2 - 64, 4), width - 136),
                top: Math.max(0, y(totals[active]) - 70),
              }}
            >
              <p className="text-[11px] text-slate-500">{data[active].label}</p>
              <p className="flex items-center gap-1.5 text-sm tabular-nums text-slate-900">
                <span className="inline-block h-0.5 w-3 rounded" style={{ background: CHART_BLUE }} aria-hidden />
                <span className="font-bold">{data[active].newDonors}</span> new
              </p>
              <p className="flex items-center gap-1.5 text-sm tabular-nums text-slate-900">
                <span className="inline-block h-0.5 w-3 rounded" style={{ background: RETURNING }} aria-hidden />
                <span className="font-bold">{data[active].returningDonors}</span> returning
              </p>
            </div>
          )}
          <table className="sr-only">
            <caption>Donor growth</caption>
            <thead>
              <tr>
                <th scope="col">Period</th>
                <th scope="col">New donors</th>
                <th scope="col">Returning donors</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.label}>
                  <th scope="row">{d.label}</th>
                  <td>{d.newDonors}</td>
                  <td>{d.returningDonors}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
