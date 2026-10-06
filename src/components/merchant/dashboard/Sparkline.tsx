import { CHART_BLUE } from "./chartUtils";

/** Tiny trend line: 2px stroke, ~10% wash, emphasised end dot with a surface
 * ring. Decorative (aria-hidden) — the tile's text carries the value. */
export default function Sparkline({ values, width = 96, height = 36 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2 || values.every((v) => v === 0)) return null;
  const pad = 5;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [
    pad + (i / (values.length - 1)) * (width - pad * 2),
    pad + (1 - (v - min) / span) * (height - pad * 2),
  ]);
  const line = pts.map(([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const [lx, ly] = pts[pts.length - 1];
  const area = `${line} L${lx.toFixed(1)},${height} L${pts[0][0].toFixed(1)},${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="wgc-fade-in shrink-0">
      <path d={area} fill={CHART_BLUE} opacity={0.1} />
      <path d={line} fill="none" stroke={CHART_BLUE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={4} fill={CHART_BLUE} stroke="#fff" strokeWidth={2} />
    </svg>
  );
}
