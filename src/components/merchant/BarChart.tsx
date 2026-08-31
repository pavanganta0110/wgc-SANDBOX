export default function BarChart({
  data,
  formatValue,
}: {
  data: { label: string; value: number }[];
  formatValue: (n: number) => string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const width = 700;
  const height = 220;
  const barGap = 8;
  const barWidth = data.length > 0 ? width / data.length - barGap : 0;
  // A real $0 day should still read as "no activity that day," not vanish
  // into blank space indistinguishable from a rendering gap — a thin
  // baseline tick keeps every bucket visible along the axis.
  const minBarHeight = 3;

  if (data.every((d) => d.value === 0)) {
    return (
      <div className="flex items-center justify-center h-56 text-sm text-slate-400">
        No results yet
      </div>
    );
  }

  const gridLines = [0.25, 0.5, 0.75, 1];

  return (
    <svg viewBox={`0 0 ${width} ${height + 30}`} className="w-full h-auto">
      <defs>
        <linearGradient id="wgcBarFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#facc15" />
          <stop offset="100%" stopColor="#eab308" />
        </linearGradient>
      </defs>

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
        const barHeight = d.value > 0 ? Math.max((d.value / max) * height, minBarHeight) : 0;
        const x = i * (barWidth + barGap);
        const y = height - barHeight;
        return (
          <g key={d.label}>
            <title>{`${d.label}: ${formatValue(d.value)}`}</title>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              fill="url(#wgcBarFill)"
              rx="4"
            />
            <text
              x={x + barWidth / 2}
              y={height + 18}
              textAnchor="middle"
              fontSize="11"
              fill="#64748b"
            >
              {d.label}
            </text>
            {d.value > 0 && (
              <text
                x={x + barWidth / 2}
                y={y - 6}
                textAnchor="middle"
                fontSize="10"
                fill="#334155"
                fontWeight="600"
              >
                {formatValue(d.value)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
