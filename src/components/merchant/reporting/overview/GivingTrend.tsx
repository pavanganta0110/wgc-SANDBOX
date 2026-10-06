"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { BarChart3, Table2 } from "lucide-react";
import type { TrendRow } from "./types";
import { SERIES } from "./tokens";
import { compactMoney, formatCents } from "./format";

const METRICS = [
  {
    key: "grossDonatedCents",
    label: "Gross",
    long: "Gross donated",
    money: true,
  },
  { key: "netDonatedCents", label: "Net", long: "Net donated", money: true },
  {
    key: "donationCount",
    label: "Count",
    long: "Donation count",
    money: false,
  },
  {
    key: "uniqueDonorCount",
    label: "Donors",
    long: "Unique donors",
    money: false,
  },
] as const;
type MetricKey = (typeof METRICS)[number]["key"];

const H = 280;
const PAD = { top: 28, right: 16, bottom: 30, left: 48 };

/** Rounds a max up to a clean tick step so gridlines land on tidy numbers. */
function niceScale(max: number, ticks = 4): { top: number; step: number } {
  if (max <= 0) return { top: ticks, step: 1 };
  const raw = max / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step =
    (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) *
    mag;
  return { top: Math.ceil(max / step) * step, step };
}

function shortMonth(period: string) {
  return period.split(" ")[0];
}

export default function GivingTrend({
  data,
  periodLabel,
}: {
  data: TrendRow[];
  periodLabel: string;
}) {
  const [metric, setMetric] = useState<MetricKey>("netDonatedCents");
  const [view, setView] = useState<"chart" | "table">("chart");
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(720);
  const wrapRef = useRef<HTMLDivElement>(null);
  const gradId = useId();
  const meta = METRICS.find((m) => m.key === metric)!;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setWidth(Math.max(280, Math.round(e.contentRect.width))),
    );
    ro.observe(el);
    setWidth(Math.max(280, Math.round(el.getBoundingClientRect().width)));
    return () => ro.disconnect();
  }, [view]);

  const values = useMemo(() => data.map((d) => d[metric]), [data, metric]);
  const total = values.reduce((s, v) => s + v, 0);
  const hasData = data.length > 0 && values.some((v) => v > 0);
  const fmt = (v: number) =>
    meta.money ? formatCents(v) : v.toLocaleString("en-US");
  const fmtAxis = (v: number) =>
    meta.money ? compactMoney(v) : v.toLocaleString("en-US");

  const peakIdx = hasData ? values.indexOf(Math.max(...values)) : -1;
  const { top, step } = niceScale(Math.max(...values, 0), 3);
  const innerW = width - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) =>
    PAD.left +
    (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH;
  const pts = values.map((v, i) => [x(i), y(v)] as const);
  const line = pts
    .map(
      ([px, py], i) =>
        `${i === 0 ? "M" : "L"}${px.toFixed(1)} ${py.toFixed(1)}`,
    )
    .join(" ");
  const area = pts.length
    ? `${line} L${pts[pts.length - 1][0].toFixed(1)} ${PAD.top + innerH} L${pts[0][0].toFixed(1)} ${PAD.top + innerH} Z`
    : "";
  const tickVals: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) tickVals.push(v);
  const labelEvery = innerW / Math.max(data.length, 1) < 44 ? 2 : 1;

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const idx = Math.round((px / rect.width) * (data.length - 1));
    setHover(Math.min(Math.max(idx, 0), data.length - 1));
  }
  function onKey(e: React.KeyboardEvent) {
    if (!data.length) return;
    if (e.key === "ArrowRight")
      setHover((h) => Math.min((h ?? -1) + 1, data.length - 1));
    else if (e.key === "ArrowLeft")
      setHover((h) => Math.max((h ?? data.length) - 1, 0));
    else if (e.key === "Home") setHover(0);
    else if (e.key === "End") setHover(data.length - 1);
    else if (e.key === "Escape") setHover(null);
    else return;
    e.preventDefault();
  }

  const active = hover !== null ? hover : null;
  const tipOnLeft = active !== null && x(active) > width / 2;

  return (
    <section
      aria-labelledby="giving-trend-title"
      className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4
            id="giving-trend-title"
            className="text-sm font-bold text-slate-900"
          >
            Giving by month
          </h4>
          <p className="mt-0.5 text-xs text-slate-500">{periodLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="radiogroup"
            aria-label="Measure"
            className="flex rounded-lg bg-slate-100 p-0.5"
          >
            {METRICS.map((m) => (
              <button
                key={m.key}
                type="button"
                role="radio"
                aria-checked={metric === m.key}
                title={m.long}
                onClick={() => setMetric(m.key)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold outline-none transition motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  metric === m.key
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div
            role="radiogroup"
            aria-label="View"
            className="flex rounded-lg bg-slate-100 p-0.5"
          >
            {(
              [
                ["chart", BarChart3, "Chart"],
                ["table", Table2, "Table"],
              ] as const
            ).map(([k, Icon, label]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={view === k}
                aria-label={`${label} view`}
                onClick={() => setView(k)}
                className={`rounded-md p-1.5 outline-none transition motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${view === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
              </button>
            ))}
          </div>
        </div>
      </div>

      {!hasData ? (
        <div className="mt-6 flex h-56 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 text-center">
          <p className="text-sm font-semibold text-slate-700">
            No giving in this period yet
          </p>
          <p className="mt-1 max-w-xs text-xs text-slate-500">
            Gifts will appear here month by month as soon as your first donation
            comes in.
          </p>
        </div>
      ) : (
        <>
          <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-xs">
            <div>
              <dt className="text-slate-500">Total</dt>
              <dd className="text-base font-bold tabular-nums text-slate-900">
                {fmt(total)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Best month</dt>
              <dd className="text-base font-bold tabular-nums text-slate-900">
                {fmt(values[peakIdx])}{" "}
                <span className="text-xs font-medium text-slate-500">
                  · {shortMonth(data[peakIdx].period)}
                </span>
              </dd>
            </div>
          </dl>

          {view === "table" ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-sm">
                <caption className="sr-only">Giving by month</caption>
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500">
                    <th scope="col" className="py-2 font-semibold">
                      Month
                    </th>
                    <th scope="col" className="py-2 text-right font-semibold">
                      Gross
                    </th>
                    <th scope="col" className="py-2 text-right font-semibold">
                      Net
                    </th>
                    <th scope="col" className="py-2 text-right font-semibold">
                      Gifts
                    </th>
                    <th scope="col" className="py-2 text-right font-semibold">
                      Donors
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((d) => (
                    <tr
                      key={d.period}
                      className="border-b border-slate-100 tabular-nums text-slate-700"
                    >
                      <th
                        scope="row"
                        className="py-2 font-medium text-slate-900"
                      >
                        {d.period}
                      </th>
                      <td className="py-2 text-right">
                        {formatCents(d.grossDonatedCents)}
                      </td>
                      <td className="py-2 text-right">
                        {formatCents(d.netDonatedCents)}
                      </td>
                      <td className="py-2 text-right">{d.donationCount}</td>
                      <td className="py-2 text-right">{d.uniqueDonorCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div
              ref={wrapRef}
              className="relative mt-3 w-full min-w-0"
              style={{ height: H }}
            >
              <svg
                width={width}
                height={H}
                viewBox={`0 0 ${width} ${H}`}
                role="img"
                aria-label={`${meta.long} by month. Total ${fmt(total)}. Best month ${shortMonth(data[peakIdx].period)} at ${fmt(values[peakIdx])}. Use the table view for every value.`}
                className="absolute left-0 top-0 block overflow-visible"
              >
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor={SERIES.indigo}
                      stopOpacity={0.12}
                    />
                    <stop
                      offset="100%"
                      stopColor={SERIES.indigo}
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                {tickVals.map((v) => (
                  <g key={v}>
                    <line
                      x1={PAD.left}
                      x2={width - PAD.right}
                      y1={y(v)}
                      y2={y(v)}
                      stroke={v === 0 ? "#CBD5E1" : "#F1F5F9"}
                      strokeWidth={1}
                    />
                    <text
                      x={PAD.left - 8}
                      y={y(v) + 4}
                      textAnchor="end"
                      fontSize={11}
                      fill="#64748B"
                      className="tabular-nums"
                    >
                      {fmtAxis(v)}
                    </text>
                  </g>
                ))}
                {data.map((d, i) =>
                  i % labelEvery === 0 ? (
                    <text
                      key={d.period}
                      x={x(i)}
                      y={H - 8}
                      textAnchor="middle"
                      fontSize={11}
                      fill="#64748B"
                    >
                      {shortMonth(d.period)}
                    </text>
                  ) : null,
                )}
                <path d={area} fill={`url(#${gradId})`} />
                <path
                  d={line}
                  fill="none"
                  stroke={SERIES.indigo}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {active !== null && (
                  <g>
                    <line
                      x1={pts[active][0]}
                      x2={pts[active][0]}
                      y1={PAD.top}
                      y2={PAD.top + innerH}
                      stroke="#94A3B8"
                      strokeWidth={1}
                    />
                    <circle
                      cx={pts[active][0]}
                      cy={pts[active][1]}
                      r={5}
                      fill={SERIES.indigo}
                      stroke="#fff"
                      strokeWidth={2}
                    />
                  </g>
                )}
                <rect
                  x={PAD.left}
                  y={0}
                  width={innerW}
                  height={H - PAD.bottom + 6}
                  fill="transparent"
                  tabIndex={0}
                  role="application"
                  aria-label="Chart. Use left and right arrow keys to read each month."
                  onPointerMove={onMove}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover((h) => h ?? peakIdx)}
                  onBlur={() => setHover(null)}
                  onKeyDown={onKey}
                  className="cursor-crosshair outline-none focus-visible:stroke-indigo-500 focus-visible:[stroke-width:2]"
                />
              </svg>
              {active !== null && (
                <div
                  className="pointer-events-none absolute z-10 w-44 rounded-xl border border-slate-200 bg-white p-3 shadow-lg"
                  style={{
                    left: x(active) + (tipOnLeft ? -12 : 12),
                    top: PAD.top - 8,
                    transform: tipOnLeft ? "translateX(-100%)" : undefined,
                  }}
                  role="status"
                >
                  <div className="text-xs font-semibold text-slate-500">
                    {data[active].period}
                  </div>
                  <div className="mt-1 text-lg font-bold tabular-nums text-slate-900">
                    {fmt(values[active])}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500 tabular-nums">
                    {data[active].donationCount} gift
                    {data[active].donationCount === 1 ? "" : "s"} ·{" "}
                    {data[active].uniqueDonorCount} donor
                    {data[active].uniqueDonorCount === 1 ? "" : "s"}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
