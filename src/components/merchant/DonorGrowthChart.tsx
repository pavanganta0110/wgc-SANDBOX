"use client";

import type { DonorGrowthPoint } from "@/lib/donors/donorAnalyticsExtended";

export default function DonorGrowthChart({ data }: { data: DonorGrowthPoint[] }) {
  const width = 700;
  const height = 220;
  const padding = 30;
  const barGap = 4;

  const max = Math.max(...data.map((d) => d.newDonors + d.returningDonors), 1);
  const hasData = data.length > 0 && data.some((d) => d.newDonors + d.returningDonors > 0);
  const barWidth = data.length ? (width - padding * 2) / data.length - barGap : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-900">Donor Growth</h3>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> New
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-slate-300 inline-block" /> Returning
          </span>
        </div>
      </div>

      {!hasData ? (
        <div className="flex items-center justify-center h-56 text-sm text-slate-400">
          No donor activity for this period.
        </div>
      ) : (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
          {data.map((d, i) => {
            const x = padding + i * (barWidth + barGap);
            const newHeight = (d.newDonors / max) * (height - padding * 2);
            const returningHeight = (d.returningDonors / max) * (height - padding * 2);
            const baseY = height - padding;
            return (
              <g key={i}>
                <rect x={x} y={baseY - returningHeight} width={barWidth} height={returningHeight} fill="#cbd5e1" />
                <rect
                  x={x}
                  y={baseY - returningHeight - newHeight}
                  width={barWidth}
                  height={newHeight}
                  fill="#10b981"
                />
                {i % Math.max(Math.ceil(data.length / 8), 1) === 0 && (
                  <text x={x + barWidth / 2} y={height - 8} textAnchor="middle" fontSize="10" fill="#64748b">
                    {d.period}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}

      {hasData && (
        <p className="text-xs text-slate-400 mt-2">
          Total New: {data.reduce((s, d) => s + d.newDonors, 0)} · Total Returning:{" "}
          {data.reduce((s, d) => s + d.returningDonors, 0)}
        </p>
      )}
    </div>
  );
}
