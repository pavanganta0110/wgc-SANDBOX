const SERIES_COLORS = ["#3b82f6", "#84cc16", "#eab308", "#ef4444", "#a855f7"];

export default function StackedBarChart({
  data,
  seriesKeys,
  formatValue,
}: {
  data: { label: string; values: Record<string, number> }[];
  seriesKeys: string[];
  formatValue: (n: number) => string;
}) {
  const totals = data.map((d) => seriesKeys.reduce((sum, k) => sum + (d.values[k] ?? 0), 0));
  const max = Math.max(...totals, 1);
  const hasData = totals.some((t) => t > 0);
  const width = 700;
  const height = 200;
  const barGap = 8;
  const barWidth = data.length > 0 ? width / data.length - barGap : 0;
  // A bucket with a genuine $0/zero total (while other buckets in the same
  // chart have real data) should still read as "confirmed zero," not vanish
  // into blank space indistinguishable from a rendering gap.
  const minBarHeight = 3;

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center h-56 text-sm text-slate-400 gap-2">
        <span>No results returned</span>
      </div>
    );
  }

  const gridLines = [0.25, 0.5, 0.75, 1];

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height + 30}`} className="w-full h-auto">
        {gridLines.map((g) => (
          <line
            key={g}
            x1={0}
            x2={width}
            y1={height - height * g}
            y2={height - height * g}
            stroke="#f1f5f9"
            strokeWidth={1}
          />
        ))}
        <line x1={0} x2={width} y1={height} y2={height} stroke="#e2e8f0" strokeWidth={1} />

        {data.map((d, i) => {
          const x = i * (barWidth + barGap);
          const total = totals[i];
          let yOffset = height;
          return (
            <g key={d.label}>
              <title>{`${d.label}: ${formatValue(total)}`}</title>
              {total > 0 ? (
                seriesKeys.map((key, si) => {
                  const value = d.values[key] ?? 0;
                  const barHeight = (value / max) * height;
                  yOffset -= barHeight;
                  return (
                    <rect
                      key={key}
                      x={x}
                      y={yOffset}
                      width={barWidth}
                      height={barHeight}
                      fill={SERIES_COLORS[si % SERIES_COLORS.length]}
                    />
                  );
                })
              ) : (
                <rect x={x} y={height - minBarHeight} width={barWidth} height={minBarHeight} fill="#e2e8f0" rx="2" />
              )}
              <text x={x + barWidth / 2} y={height + 18} textAnchor="middle" fontSize="11" fill="#64748b">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex items-center gap-4 mt-2 flex-wrap">
        {seriesKeys.map((key, si) => (
          <div key={key} className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-sm"
              style={{ backgroundColor: SERIES_COLORS[si % SERIES_COLORS.length] }}
            />
            <span className="text-xs text-slate-500">{key}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
