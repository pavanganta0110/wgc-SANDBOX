import Link from "next/link";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import type { ComplianceStatus } from "@/lib/finix/sync/complianceForms";

export default function ComplianceBanner({ status }: { status: ComplianceStatus }) {
  if (!status.needsAttention) return null;

  const overdue = status.isOverdue;

  return (
    <div
      className={`flex items-center gap-3 px-6 md:px-10 py-3 border-b ${
        overdue ? "bg-red-50 border-red-100" : "bg-amber-50 border-amber-100"
      }`}
    >
      {overdue ? (
        <ShieldAlert className="w-5 h-5 text-red-600 shrink-0" />
      ) : (
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
      )}
      <p className={`text-sm font-semibold flex-grow ${overdue ? "text-red-800" : "text-amber-800"}`}>
        {overdue
          ? "Your PCI compliance attestation is overdue. Payments may be affected until it's completed."
          : status.daysUntilDue !== null && status.daysUntilDue <= 0
            ? "Your PCI compliance attestation is due today."
            : `Your PCI compliance attestation is due in ${status.daysUntilDue} day${status.daysUntilDue === 1 ? "" : "s"}.`}
      </p>
      <Link
        href="/merchant/compliance"
        className={`text-xs font-bold uppercase tracking-wide px-3 py-1.5 rounded-lg shrink-0 ${
          overdue ? "bg-red-600 text-white hover:bg-red-700" : "bg-amber-600 text-white hover:bg-amber-700"
        }`}
      >
        Complete Now
      </Link>
    </div>
  );
}
