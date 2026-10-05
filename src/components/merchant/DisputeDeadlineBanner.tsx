import { CheckCircle2, Clock, AlertTriangle, CalendarClock } from "lucide-react";
import { formatDateCDT } from "@/lib/formatDateTimeCDT";

export default function DisputeDeadlineBanner({
  evidenceDueAt,
  respondedAt,
}: {
  evidenceDueAt: Date | null;
  respondedAt: Date | null;
}) {
  if (respondedAt) {
    return (
      <div className="flex items-center gap-2.5 bg-wgc-success-50 border border-wgc-success-100 rounded-xl px-4 py-3">
        <CheckCircle2 className="w-5 h-5 text-wgc-success-600 shrink-0" />
        <div>
          <p className="text-sm font-bold text-wgc-success-800">Evidence Submitted</p>
          <p className="text-xs text-wgc-success-700">Waiting for processor review</p>
        </div>
      </div>
    );
  }

  if (!evidenceDueAt) return null;

  const hoursRemaining = (evidenceDueAt.getTime() - Date.now()) / (1000 * 60 * 60);

  if (hoursRemaining <= 0) {
    return (
      <div className="flex items-center gap-2.5 bg-wgc-error-50 border border-wgc-error-100 rounded-xl px-4 py-3">
        <AlertTriangle className="w-5 h-5 text-wgc-error-600 shrink-0" />
        <p className="text-sm font-bold text-wgc-error-800">Evidence Deadline Passed</p>
      </div>
    );
  }

  if (hoursRemaining <= 72) {
    return (
      <div className="flex items-center gap-2.5 bg-wgc-warning-50 border border-wgc-warning-100 rounded-xl px-4 py-3">
        <Clock className="w-5 h-5 text-wgc-warning-600 shrink-0" />
        <div>
          <p className="text-sm font-bold text-wgc-warning-800">Evidence Due Soon</p>
          <p className="text-xs text-wgc-warning-700">{Math.max(1, Math.round(hoursRemaining))} hours remaining</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5 bg-wgc-success-50 border border-wgc-success-100 rounded-xl px-4 py-3">
      <CalendarClock className="w-5 h-5 text-wgc-success-600 shrink-0" />
      <div>
        <p className="text-sm font-bold text-wgc-success-800">Evidence Due</p>
        <p className="text-xs text-wgc-success-700">{formatDateCDT(evidenceDueAt)}</p>
      </div>
    </div>
  );
}
