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

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center h-56 text-sm text-slate-400 gap-2">
        <span>No results returned</span>
      </div>
    );
  }

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height + 30}`} className="w-full h-auto">
        {data.map((d, i) => {
          const x = i * (barWidth + barGap);
          let yOffset = height;
          return (
            <g key={d.label}>
              {seriesKeys.map((key, si) => {
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
              })}
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
