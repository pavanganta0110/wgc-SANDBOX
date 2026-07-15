import { CheckCircle2, Circle, XCircle, Clock } from "lucide-react";

export function titleCase(value: string | null | undefined) {
  if (!value) return "—";
  return value
    .replace(/_/g, " ")
    .replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

export function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between text-sm py-1 gap-4">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className="font-semibold text-slate-700 text-right break-all">{value}</span>
    </div>
  );
}

export function FlowStep({
  label,
  detail,
  status,
}: {
  label: string;
  detail?: string;
  status: "done" | "pending" | "failed" | "upcoming";
}) {
  const icon =
    status === "failed" ? (
      <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
    ) : status === "pending" ? (
      <Clock className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
    ) : status === "done" ? (
      <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
    ) : (
      <Circle className="w-4 h-4 text-slate-300 mt-0.5 shrink-0" />
    );
  return (
    <div className="flex items-start gap-2.5">
      {icon}
      <div>
        <p className={`text-sm font-semibold ${status === "upcoming" ? "text-slate-400" : "text-slate-800"}`}>
          {label}
        </p>
        {detail && <p className="text-xs text-slate-400">{detail}</p>}
      </div>
    </div>
  );
}
