import Link from "next/link";
import type { OrgAccessState } from "@/lib/billing/accessGate";

const MESSAGES: Partial<Record<OrgAccessState, { text: string; cta: string }>> = {
  APPROVED_BILLING_REQUIRED: {
    text: "Finish setting up your WGC Platform subscription billing to unlock full dashboard access.",
    cta: "Finish Setup",
  },
  PAST_DUE_IN_GRACE: {
    text: "Your last WGC subscription payment was unsuccessful. Please update your billing method to avoid access restrictions.",
    cta: "Update Billing",
  },
  PAST_DUE_EXPIRED: {
    text: "Your WGC subscription payment is past due and the grace period has ended. Full dashboard access is restricted until billing is resolved.",
    cta: "Update Billing",
  },
  CANCELED: {
    text: "Your WGC Platform subscription has been canceled. Reactivate to restore full dashboard access.",
    cta: "Manage Subscription",
  },
  SUSPENDED: {
    text: "This organization's account has been suspended. Contact WGC Payments support for assistance.",
    cta: "Contact Support",
  },
};

/** Persistent, non-dismissable banner shown whenever the organization's WGC
 * platform-billing access state restricts dashboard access — purely
 * informational; the actual enforcement is server-side (see
 * requireMerchantSession.ts / (dashboard)/error.tsx). */
export default function BillingGateBanner({ state }: { state: OrgAccessState }) {
  const copy = MESSAGES[state];
  if (!copy) return null;
  const isSuspended = state === "SUSPENDED";
  return (
    <div className={`text-sm px-6 py-3 flex items-center justify-between gap-4 ${isSuspended ? "bg-red-600" : "bg-amber-500"} text-white`}>
      <p>
        <strong>{isSuspended ? "Account restricted:" : "Action needed:"}</strong> {copy.text}
      </p>
      <Link
        href={isSuspended ? "/merchant/support" : "/merchant/subscription"}
        className={`whitespace-nowrap px-4 py-1.5 rounded-full bg-white font-semibold hover:bg-slate-50 ${isSuspended ? "text-red-700" : "text-amber-700"}`}
      >
        {copy.cta}
      </Link>
    </div>
  );
}
