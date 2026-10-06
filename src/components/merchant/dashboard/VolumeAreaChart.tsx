"use client";

import { useId, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { HeartHandshake } from "lucide-react";
import { useChartWidth } from "./useChartWidth";
import { CHART_BLUE, INK, niceTicks, compactDollars, fullDollars, labelIndices } from "./chartUtils";

export interface TrendPoint {
  label: string;
  /** Dollars. */
  value: number;
}

/**
 * Main trend chart: soft area wash + 2px line, hairline grid, crosshair and
 * tooltip on hover/focus, labels only on the peak and latest points. Single
 * series, so no legend — the card title names it. Text alternative: an
 * sr-only table of every value.
 */
export default function VolumeAreaChart({ data, title }: { data: TrendPoint[]; title: string }) {
  const { ref, width } = useChartWidth<HTMLDivElement>();
  const gradientId = useId();
  const [active, setActive] = useState<number | null>(null);

  const hasData = data.some((d) => d.value > 0);
  const height = width > 0 && width < 520 ? 220 : 280;
  const pad = { top: 28, right: 20, bottom: 32, left: 52 };
  const plotW = Math.max(0, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;
  const { ticks, top } = niceTicks(Math.max(...data.map((d) => d.value), 0));

  const x = (i: number) => pad.left + (data.length <= 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
  const y = (v: number) => pad.top + plotH - (v / top) * plotH;

  const peakIndex = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);
  const lastIndex = data.length - 1;
  const showLast = lastIndex !== peakIndex && data[lastIndex].value > 0 && Math.abs(x(lastIndex) - x(peakIndex)) > 72;
  const xLabels = labelIndices(data.length, plotW);

  const pathTo = (end: number) =>
    data
      .slice(0, end + 1)
      .map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`)
      .join(" ");
  const line = pathTo(lastIndex);
  // The final bucket runs up to "now", so it is always still filling in:
  // draw its segment dashed instead of letting it read as a collapse.
  const solidLine = lastIndex >= 1 ? pathTo(lastIndex - 1) : line;
  const lastSegment = lastIndex >= 1 ? `M${x(lastIndex - 1).toFixed(1)},${y(data[lastIndex - 1].value).toFixed(1)} L${x(lastIndex).toFixed(1)},${y(data[lastIndex].value).toFixed(1)}` : "";
  const area = `${line} L${x(lastIndex).toFixed(1)},${(pad.top + plotH).toFixed(1)} L${x(0).toFixed(1)},${(pad.top + plotH).toFixed(1)} Z`;

  const summary = hasData
    ? `${title}. ${data[0].label} to ${data[lastIndex].label}. Peak ${fullDollars(data[peakIndex].value)} in ${data[peakIndex].label}.`
    : `${title}. No donations in this period.`;

  const nearest = (clientX: number, rect: DOMRect) => {
    if (data.length <= 1) return 0;
    const rel = (clientX - rect.left - pad.left) / plotW;
    return Math.min(data.length - 1, Math.max(0, Math.round(rel * (data.length - 1))));
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") setActive((a) => Math.min(lastIndex, (a ?? -1) + 1));
    else if (e.key === "ArrowLeft") setActive((a) => Math.max(0, (a ?? 1) - 1));
    else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(lastIndex);
    else if (e.key === "Escape") setActive(null);
    else return;
    e.preventDefault();
  };

  const tip = active != null ? data[active] : null;
  const prev = active != null && active > 0 ? data[active - 1].value : null;
  const change = tip && prev != null && prev > 0 ? ((tip.value - prev) / prev) * 100 : null;

  if (!hasData) {
    return (
      <div className="flex h-[220px] flex-col items-center justify-center gap-3 rounded-xl bg-slate-50 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-400 ring-1 ring-slate-200">
          <HeartHandshake className="h-5 w-5" aria-hidden />
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-700">No donations in this period yet</p>
          <p className="text-sm text-slate-500">Share your giving page to start collecting.</p>
        </div>
        <Link
          href="/merchant/giving-links"
          className="rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
        >
          Open giving pages
        </Link>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="relative outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 rounded-lg"
      style={{ minHeight: height }}
      tabIndex={0}
      role="group"
      aria-label={`${summary} Use the left and right arrow keys to read each value.`}
      onKeyDown={onKey}
      onFocus={() => setActive((a) => a ?? lastIndex)}
      onBlur={() => setActive(null)}
    >
      {width > 0 && (
        <svg
          width={width}
          height={height}
          className="wgc-fade-in block select-none"
          aria-hidden
          onPointerMove={(e) => setActive(nearest(e.clientX, e.currentTarget.getBoundingClientRect()))}
          onPointerLeave={() => setActive(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_BLUE} stopOpacity="0.2" />
              <stop offset="100%" stopColor={CHART_BLUE} stopOpacity="0" />
            </linearGradient>
          </defs>

          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? INK.axis : INK.grid} strokeWidth={1} />
              <text x={pad.left - 10} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill={INK.muted} className="tabular-nums">
                {compactDollars(t)}
              </text>
            </g>
          ))}

          {data.map((d, i) =>
            xLabels.has(i) ? (
              <text key={d.label + i} x={x(i)} y={height - 10} textAnchor={i === 0 ? "start" : i === lastIndex ? "end" : "middle"} fontSize={11} fill={INK.muted}>
                {d.label}
              </text>
            ) : null
          )}

          <path d={area} fill={`url(#${gradientId})`} />
          <path d={solidLine} fill="none" stroke={CHART_BLUE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {lastSegment && (
            <path d={lastSegment} fill="none" stroke={CHART_BLUE} strokeWidth={2} strokeLinecap="round" strokeDasharray="2 5" />
          )}

          {/* Direct labels: peak and latest only. */}
          {[peakIndex, ...(showLast ? [lastIndex] : [])].filter((i) => active == null || i !== active).map((i) => (
            <g key={`label-${i}`}>
              <circle cx={x(i)} cy={y(data[i].value)} r={4} fill={CHART_BLUE} stroke="#fff" strokeWidth={2} />
              <text x={Math.min(Math.max(x(i), pad.left + 24), width - pad.right - 24)} y={y(data[i].value) - 12} textAnchor="middle" fontSize={11} fontWeight={600} fill={INK.primary} className="tabular-nums">
                {compactDollars(data[i].value)}
              </text>
            </g>
          ))}

          {active != null && (
            <g>
              <line x1={x(active)} x2={x(active)} y1={pad.top} y2={pad.top + plotH} stroke={INK.axis} strokeWidth={1} />
              <circle cx={x(active)} cy={y(data[active].value)} r={5} fill={CHART_BLUE} stroke="#fff" strokeWidth={2} />
            </g>
          )}
        </svg>
      )}

      {tip && active != null && width > 0 && (
        <div
          className="pointer-events-none absolute z-10 min-w-[148px] rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg"
          style={{
            left: Math.min(Math.max(x(active) + 12, 8), width - 164),
            top: Math.max(4, y(tip.value) - 64),
          }}
        >
          <p className="text-[11px] font-medium text-slate-500">{tip.label}</p>
          <p className="flex items-center gap-2 text-base font-bold tabular-nums text-slate-900">
            <span className="inline-block h-0.5 w-3 rounded" style={{ background: CHART_BLUE }} aria-hidden />
            {fullDollars(tip.value)}
          </p>
          {active === lastIndex && <p className="text-[11px] text-slate-500">In progress, still filling in</p>}
          {change != null && (
            <p className="text-[11px] tabular-nums text-slate-500">
              {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(1)}% vs previous
            </p>
          )}
        </div>
      )}

      <p className="sr-only" aria-live="polite">
        {tip ? `${tip.label}: ${fullDollars(tip.value)}` : ""}
      </p>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">Amount</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <th scope="row">{d.label}</th>
              <td>{fullDollars(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
