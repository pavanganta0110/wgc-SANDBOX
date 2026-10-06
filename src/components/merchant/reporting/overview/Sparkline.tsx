/** Tiny trend line for a KPI tile. Decorative: the tile's number carries the meaning. */
export default function Sparkline({
  values,
  color,
  height = 36,
}: {
  values: number[];
  color: string;
  height?: number;
}) {
  if (values.length < 2 || values.every((v) => v === 0)) return null;
  const w = 120;
  const max = Math.max(...values, 1);
  const pts = values.map(
    (v, i) =>
      [
        4 + (i / (values.length - 1)) * (w - 8),
        height - 4 - (v / max) * (height - 10),
      ] as const,
  );
  const line = pts
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
  const last = pts[pts.length - 1];
  return (
    <div className="relative" style={{ height }} aria-hidden>
      <svg
        viewBox={`0 0 ${w} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        className="block"
      >
        <path
          d={`${line} L${w - 4} ${height} L4 ${height} Z`}
          fill={color}
          fillOpacity={0.08}
        />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {/* The end dot is an HTML element so the SVG's non-uniform stretch can't squash it into an oval. */}
      <span
        className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white"
        style={{
          left: `${(last[0] / w) * 100}%`,
          top: `${(last[1] / height) * 100}%`,
          background: color,
        }}
      />
    </div>
  );
}
