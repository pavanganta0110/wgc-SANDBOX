"use client";

import { useState } from "react";
import type { TrendPoint } from "@/lib/donors/donorAnalytics";
import { formatCents } from "@/lib/format";

const METRICS = [
  { key: "grossDonatedCents", label: "Gross Donated" },
  { key: "netDonatedCents", label: "Net Donated" },
  { key: "donationCount", label: "Donation Count" },
  { key: "uniqueDonorCount", label: "Unique Donors" },
] as const;

type MetricKey = (typeof METRICS)[number]["key"];

export default function DonationTrendChart({ data }: { data: TrendPoint[] }) {
  const [metric, setMetric] = useState<MetricKey>("grossDonatedCents");

  const values = data.map((d) => d[metric]);
  const max = Math.max(...values, 1);
  const width = 700;
  const height = 220;
  const padding = 30;

  const hasData = data.length > 0 && values.some((v) => v > 0);
  const isMoney = metric === "grossDonatedCents" || metric === "netDonatedCents";
  const formatValue = (v: number) => (isMoney ? formatCents(v) : String(v));

  const points = data.map((_, i) => {
    const x = padding + (i / Math.max(data.length - 1, 1)) * (width - padding * 2);
    const y = height - padding - (values[i] / max) * (height - padding * 2);
    return { x, y };
  });
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = points.length
    ? `${linePath} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`
    : "";

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-900">Donation Trend</h3>
        <div className="flex items-center gap-1 bg-slate-50 rounded-lg p-1">
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold ${
                metric === m.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {!hasData ? (
        <div className="flex items-center justify-center h-56 text-sm text-slate-400">
          No donation activity for this period.
        </div>
      ) : (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
          {areaPath && <path d={areaPath} fill="#3b82f6" fillOpacity={0.08} />}
          <path d={linePath} fill="none" stroke="#3b82f6" strokeWidth={2} />
          {points.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={3} fill="#3b82f6" />
              {i % Math.max(Math.ceil(data.length / 8), 1) === 0 && (
                <text x={p.x} y={height - 8} textAnchor="middle" fontSize="10" fill="#64748b">
                  {data[i].period}
                </text>
              )}
            </g>
          ))}
        </svg>
      )}

      {hasData && (
        <p className="text-xs text-slate-400 mt-2">
          Peak: {formatValue(max)} · Total: {formatValue(values.reduce((s, v) => s + v, 0))}
        </p>
      )}
    </div>
  );
}
