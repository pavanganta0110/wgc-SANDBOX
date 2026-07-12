const STATE_STYLES: Record<string, string> = {
  SUCCEEDED: "bg-green-50 text-green-700",
  FAILED: "bg-red-50 text-red-700",
  PENDING: "bg-amber-50 text-amber-700",
  CANCELED: "bg-slate-100 text-slate-600",
  REFUNDED: "bg-amber-50 text-amber-700",
  PARTIALLY_REFUNDED: "bg-amber-50 text-amber-700",
  REFUND_PENDING: "bg-amber-50 text-amber-700",
  VOIDED: "bg-slate-100 text-slate-500",
  CAPTURED: "bg-green-50 text-green-700",
  EXPIRED: "bg-slate-100 text-slate-500",
  RETURNED: "bg-red-50 text-red-700",
  ACTIVE: "bg-green-50 text-green-700",
  INACTIVE: "bg-slate-100 text-slate-500",
  ARCHIVED: "bg-slate-100 text-slate-400",
  PROCESSING: "bg-amber-50 text-amber-700",
  SENT: "bg-blue-50 text-blue-700",
  COMPLETED: "bg-green-50 text-green-700",
  // Disputes (FinixDispute.state / resolveDisputeDisplayStatus)
  WON: "bg-green-50 text-green-700",
  LOST: "bg-red-50 text-red-700",
  OPEN: "bg-blue-50 text-blue-700",
  NEEDS_RESPONSE: "bg-red-50 text-red-700",
  UNDER_REVIEW: "bg-amber-50 text-amber-700",
  ACCEPTED: "bg-slate-100 text-slate-600",
  CLOSED: "bg-slate-100 text-slate-500",
  // Settlements
  ACCRUING: "bg-amber-50 text-amber-700",
  READY: "bg-blue-50 text-blue-700",
  FUNDED: "bg-green-50 text-green-700",
  PAID: "bg-green-50 text-green-700",
  SETTLED: "bg-green-50 text-green-700",
  // Reconciliation
  UNRECONCILED: "bg-slate-100 text-slate-600",
  PARTIALLY_RECONCILED: "bg-amber-50 text-amber-700",
  RECONCILED: "bg-green-50 text-green-700",
  MISMATCH: "bg-red-50 text-red-700",
  NEEDS_REVIEW: "bg-red-50 text-red-700",
  // Donors (resolveDonorDisplayStatus)
  AT_RISK: "bg-red-50 text-red-700",
  RECURRING: "bg-blue-50 text-blue-700",
  // Subscriptions / Recurring Donors (resolveSubscriptionDisplayStatus / resolveRecurringDonorStatus)
  PAST_DUE: "bg-red-50 text-red-700",
  PAUSED: "bg-amber-50 text-amber-700",
  MIXED: "bg-amber-50 text-amber-700",
  NONE: "bg-slate-100 text-slate-400",
  // Subscription Setup Links
  OPENED: "bg-blue-50 text-blue-700",
  REVOKED: "bg-slate-100 text-slate-500",
  COMPLETING: "bg-amber-50 text-amber-700",
  // Payment methods / verification / organization capability status
  ENABLED: "bg-green-50 text-green-700",
  DISABLED: "bg-slate-100 text-slate-500",
  PENDING_APPROVAL: "bg-amber-50 text-amber-700",
  REQUIRES_ACTION: "bg-red-50 text-red-700",
  NOT_AVAILABLE: "bg-slate-100 text-slate-400",
  VERIFIED: "bg-green-50 text-green-700",
  VERIFYING: "bg-amber-50 text-amber-700",
  REJECTED: "bg-red-50 text-red-700",
  REPLACED: "bg-slate-100 text-slate-400",
  NOT_STARTED: "bg-slate-100 text-slate-400",
  // Organization account status
  LIMITED: "bg-amber-50 text-amber-700",
  // Annual statements
  NOT_GENERATED: "bg-slate-100 text-slate-500",
  GENERATED: "bg-green-50 text-green-700",
  NOT_SENT: "bg-slate-100 text-slate-500",
  QUEUED: "bg-amber-50 text-amber-700",
  DELIVERED: "bg-green-50 text-green-700",
  BOUNCED: "bg-red-50 text-red-700",
  // Team & Access / Security
  NOT_SUPPORTED: "bg-slate-100 text-slate-400",
  // Payment method availability
  DOMAIN_VERIFICATION_REQUIRED: "bg-amber-50 text-amber-700",
  CONFIGURATION_REQUIRED: "bg-slate-100 text-slate-500",
  // Support tickets
  IN_PROGRESS: "bg-blue-50 text-blue-700",
  WAITING_ON_ORGANIZATION: "bg-amber-50 text-amber-700",
  WAITING_ON_SUPPORT: "bg-blue-50 text-blue-700",
  RESOLVED: "bg-green-50 text-green-700",
  // System status
  OPERATIONAL: "bg-green-50 text-green-700",
  DEGRADED: "bg-amber-50 text-amber-700",
  OUTAGE: "bg-red-50 text-red-700",
  // Payout bank account
  CURRENT: "bg-green-50 text-green-700",
  SUBMITTED: "bg-amber-50 text-amber-700",
  PENDING_VERIFICATION: "bg-amber-50 text-amber-700",
  APPROVED: "bg-green-50 text-green-700",
  HISTORICAL: "bg-slate-100 text-slate-400",
};

export default function StateBadge({ state }: { state: string | null | undefined }) {
  const s = (state || "UNKNOWN").toUpperCase();
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
        STATE_STYLES[s] || "bg-slate-100 text-slate-600"
      }`}
    >
      {s.replace(/_/g, " ")}
    </span>
  );
}
