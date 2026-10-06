import {
  CheckCircle2,
  Clock3,
  PauseCircle,
  XCircle,
  CircleHelp,
} from "lucide-react";

type Tone = "active" | "paused" | "canceled" | "lapsed" | "neutral";

const TONES: Record<
  Tone,
  { cls: string; Icon: typeof CheckCircle2; label: string }
> = {
  active: {
    cls: "bg-emerald-50 text-emerald-700",
    Icon: CheckCircle2,
    label: "Active",
  },
  paused: {
    cls: "bg-amber-50 text-amber-800",
    Icon: PauseCircle,
    label: "Paused",
  },
  canceled: {
    cls: "bg-slate-100 text-slate-600",
    Icon: XCircle,
    label: "Canceled",
  },
  lapsed: { cls: "bg-rose-50 text-rose-700", Icon: Clock3, label: "Lapsed" },
  neutral: { cls: "bg-slate-100 text-slate-600", Icon: CircleHelp, label: "" },
};

/** Status as icon + label (never color alone). Unknown values render as plain neutral text. */
export default function StatusPill({
  status,
}: {
  status: string | null | undefined;
}) {
  const raw = (status ?? "").toString().trim();
  const key = raw.toLowerCase();
  const tone: Tone = key.startsWith("active")
    ? "active"
    : key.startsWith("paus")
      ? "paused"
      : key.startsWith("cancel")
        ? "canceled"
        : key.startsWith("lapse")
          ? "lapsed"
          : "neutral";
  const t = TONES[tone];
  const label = tone === "neutral" ? raw || "—" : t.label;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${t.cls}`}
    >
      {tone !== "neutral" && <t.Icon className="h-3 w-3" aria-hidden />}
      {label}
    </span>
  );
}
