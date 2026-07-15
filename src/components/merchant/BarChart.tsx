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

  if (data.every((d) => d.value === 0)) {
    return (
      <div className="flex items-center justify-center h-56 text-sm text-slate-400">
        No results yet
      </div>
    );
  }

  return (
    <svg viewBox={`0 0 ${width} ${height + 30}`} className="w-full h-auto">
      {data.map((d, i) => {
        const barHeight = (d.value / max) * height;
        const x = i * (barWidth + barGap);
        const y = height - barHeight;
        return (
          <g key={d.label}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              fill="#eab308"
              rx="3"
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
