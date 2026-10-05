import Link from "next/link";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import type { ComplianceStatus } from "@/lib/finix/sync/complianceForms";

export default function ComplianceBanner({ status }: { status: ComplianceStatus }) {
  if (!status.needsAttention) return null;

  const overdue = status.isOverdue;

  return (
    <div
      className={`flex items-center gap-3 px-6 md:px-10 py-3 border-b ${
        overdue ? "bg-wgc-error-50 border-wgc-error-100" : "bg-wgc-warning-50 border-wgc-warning-100"
      }`}
    >
      {overdue ? (
        <ShieldAlert className="w-5 h-5 text-wgc-error-600 shrink-0" />
      ) : (
        <AlertTriangle className="w-5 h-5 text-wgc-warning-600 shrink-0" />
      )}
      <p className={`text-sm font-semibold flex-grow ${overdue ? "text-wgc-error-800" : "text-wgc-warning-800"}`}>
        {overdue
          ? "Your PCI compliance attestation is overdue. Payments may be affected until it's completed."
          : status.daysUntilDue !== null && status.daysUntilDue <= 0
            ? "Your PCI compliance attestation is due today."
            : `Your PCI compliance attestation is due in ${status.daysUntilDue} day${status.daysUntilDue === 1 ? "" : "s"}.`}
      </p>
      <Link
        href="/merchant/compliance"
        className={`text-xs font-bold uppercase tracking-wide px-3 py-1.5 rounded-lg shrink-0 ${
          overdue ? "bg-wgc-error-600 text-white hover:bg-wgc-error-700" : "bg-wgc-warning-600 text-white hover:bg-wgc-warning-700"
        }`}
      >
        Complete Now
      </Link>
    </div>
  );
}
