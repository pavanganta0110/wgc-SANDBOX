import { CheckCircle2, AlertTriangle, XCircle, CircleDashed } from "lucide-react";
import type { AuthMeter, AuthStatus } from "@/lib/reports/dashboardHome";

// Status palette (dataviz, fixed hues). Warning is low-contrast on white by
// design, so the icon and headline always accompany the colour.
const STATUS: Record<AuthStatus, { stroke: string; text: string; Icon: typeof CheckCircle2 }> = {
  good: { stroke: "#0ca30c", text: "text-[#006300]", Icon: CheckCircle2 },
  warning: { stroke: "#fab219", text: "text-amber-800", Icon: AlertTriangle },
  critical: { stroke: "#d03b3b", text: "text-red-700", Icon: XCircle },
  none: { stroke: "#cbd5e1", text: "text-slate-500", Icon: CircleDashed },
};

/** Radial progress meter for the authorization (approval) rate. */
export default function AuthRateMeter({ meter }: { meter: AuthMeter }) {
  const { stroke, text, Icon } = STATUS[meter.status];
  const size = 132;
  const r = 54;
  const c = 2 * Math.PI * r;
  const pct = meter.ratePercent ?? 0;
  const label = meter.ratePercent == null ? "No data" : `${meter.ratePercent.toFixed(1)}%`;
  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox="0 0 132 132" role="img" aria-label={`Authorization rate: ${label}. ${meter.headline}. ${meter.caption}`}>
          <circle cx={66} cy={66} r={r} fill="none" stroke="#eef1f5" strokeWidth={12} />
          {meter.ratePercent != null && (
            <circle
              cx={66}
              cy={66}
              r={r}
              fill="none"
              stroke={stroke}
              strokeWidth={12}
              strokeLinecap="round"
              strokeDasharray={`${(pct / 100) * c} ${c}`}
              transform="rotate(-90 66 66)"
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold leading-none text-slate-900 tabular-nums">{label}</span>
          {meter.ratePercent != null && <span className="mt-1 text-[11px] font-medium text-slate-500">approved</span>}
        </div>
      </div>
      <div className="min-w-0">
        <p className={`flex items-center gap-1.5 text-sm font-semibold ${text}`}>
          <Icon className="h-4 w-4" aria-hidden />
          {meter.headline}
        </p>
        <p className="mt-1 text-sm text-slate-500">{meter.caption}</p>
      </div>
    </div>
  );
}
