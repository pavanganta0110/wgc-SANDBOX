"use client";

import { useState } from "react";
import { useChartWidth } from "./useChartWidth";
import { CHART_BLUE, INK, niceTicks, compactDollars, fullDollars, labelIndices } from "./chartUtils";
import type { TrendPoint } from "./VolumeAreaChart";

/**
 * Companion bar chart (settlements, deposits). Marks follow the dataviz
 * spec: <= 24px wide, 4px rounded data end, square at the baseline, a gap
 * between neighbours, one label only (the peak). Each bar is its own hover
 * and focus target.
 */
export default function MiniBarChart({ data, title, emptyText }: { data: TrendPoint[]; title: string; emptyText: string }) {
  const { ref, width } = useChartWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const hasData = data.some((d) => d.value > 0);
  const height = 168;
  const pad = { top: 22, right: 8, bottom: 26, left: 44 };
  const plotW = Math.max(0, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;
  const { ticks, top } = niceTicks(Math.max(...data.map((d) => d.value), 0), 3);
  const band = data.length ? plotW / data.length : 0;
  const barW = Math.min(24, band * 0.62);
  const y = (v: number) => pad.top + plotH - (v / top) * plotH;
  const peak = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);
  const xLabels = labelIndices(data.length, plotW, 56);

  if (!hasData) {
    return (
      <div className="flex h-[168px] items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">{emptyText}</div>
    );
  }

  const barPath = (i: number, v: number) => {
    const cx = pad.left + band * i + band / 2;
    const x0 = cx - barW / 2;
    const yTop = y(v);
    const base = pad.top + plotH;
    const h = Math.max(base - yTop, 2);
    const r = Math.min(4, barW / 2, h);
    return `M${x0},${base} V${base - h + r} Q${x0},${base - h} ${x0 + r},${base - h} H${x0 + barW - r} Q${x0 + barW},${base - h} ${x0 + barW},${base - h + r} V${base} Z`;
  };

  return (
    <div ref={ref} className="relative" style={{ minHeight: height }}>
      {width > 0 && (
        <svg width={width} height={height} className="wgc-fade-in block" role="img" aria-label={`${title}. Peak ${fullDollars(data[peak].value)} in ${data[peak].label}.`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? INK.axis : INK.grid} strokeWidth={1} />
              <text x={pad.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={10.5} fill={INK.muted} className="tabular-nums">
                {compactDollars(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = pad.left + band * i + band / 2;
            return (
              <g key={d.label + i}>
                {/* Hit target spans the whole band, taller than the mark. */}
                <rect
                  x={pad.left + band * i}
                  y={pad.top}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${d.label}: ${fullDollars(d.value)}`}
                  className="outline-none"
                  onPointerEnter={() => setActive(i)}
                  onPointerLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                />
                <path d={barPath(i, d.value)} fill={CHART_BLUE} opacity={(active == null || active === i ? 1 : 0.45) * (i === data.length - 1 ? 0.55 : 1)} style={{ transition: "opacity 120ms" }} pointerEvents="none" />
                {xLabels.has(i) && (
                  <text x={cx} y={height - 8} textAnchor="middle" fontSize={10.5} fill={INK.muted}>
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
          {data[peak].value > 0 && (
            <text x={pad.left + band * peak + band / 2} y={y(data[peak].value) - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill={INK.primary} className="tabular-nums" pointerEvents="none">
              {compactDollars(data[peak].value)}
            </text>
          )}
        </svg>
      )}
      {active != null && width > 0 && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 shadow-lg"
          style={{
            left: Math.min(Math.max(pad.left + band * active + band / 2 - 56, 4), width - 116),
            top: Math.max(0, y(data[active].value) - 52),
          }}
        >
          <p className="text-[11px] text-slate-500">{data[active].label}</p>
          <p className="text-sm font-bold tabular-nums text-slate-900">{fullDollars(data[active].value)}</p>
          {active === data.length - 1 && <p className="text-[11px] text-slate-500">In progress</p>}
        </div>
      )}
    </div>
  );
}
