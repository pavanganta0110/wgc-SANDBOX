/** Chart palette. Slot 1 blue is the validated default categorical hue
 * (dataviz validate_palette.js passes the four source colors on #ffffff:
 * worst adjacent CVD ΔE 9.1, normal-vision ΔE 22.9). Aqua and yellow sit
 * under 3:1 contrast on white, so every use is paired with visible values. */
export const CHART_BLUE = "#2a78d6";
export const SOURCE_COLORS = {
  givingPages: "#2a78d6",
  events: "#eb6834",
  campaigns: "#1baf7a",
  pledges: "#eda100",
  other: "#c3c2b7",
} as const;

export const INK = { primary: "#0f172a", secondary: "#475569", muted: "#64748b", grid: "#eef1f5", axis: "#cbd5e1" };

/** Round-number y ticks from 0 to a "nice" max just above the data. */
export function niceTicks(max: number, target = 4): { ticks: number[]; top: number } {
  if (!(max > 0)) return { ticks: [0, 1], top: 1 };
  const rough = max / target;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const frac = rough / pow;
  const step = (frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 2.5 ? 2.5 : frac <= 5 ? 5 : 10) * pow;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return { ticks, top };
}

/** $1.2K / $3.4M style for axes and small labels. Input is dollars. */
export function compactDollars(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${trim(n / 1_000_000)}M`;
  if (abs >= 1_000) return `$${trim(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}
function trim(n: number) {
  return (Math.round(n * 10) / 10).toString();
}

export function fullDollars(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

/** Indices of x labels to show so they never collide: evenly spaced, always
 * including the last point. */
export function labelIndices(count: number, plotWidth: number, minGap = 64): Set<number> {
  const out = new Set<number>();
  if (count <= 0) return out;
  const maxLabels = Math.max(2, Math.floor(plotWidth / minGap));
  const step = Math.max(1, Math.ceil(count / maxLabels));
  for (let i = count - 1; i >= 0; i -= step) out.add(i);
  return out;
}
