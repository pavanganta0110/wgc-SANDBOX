import { redirect } from "next/navigation";
import Link from "next/link";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import type { OrgAccessState } from "@/lib/billing/accessGate";

/**
 * The tailored destination for every restricted dashboard access state —
 * reached via the (dashboard)/error.tsx boundary's link, or directly. Unlike
 * error.tsx (a client component that only ever receives a serialized Error
 * with no state info, see its own comment for why), this is a server
 * component that calls requireMerchantSession(true) itself and reads the
 * real orgAccessState directly — so it can show the accurate reason without
 * ever needing to serialize billing state through a thrown error.
 *
 * Deliberately shows only enough to explain WHY access is restricted and
 * what to do next — never payment method, charge history, promotion
 * details, or cancellation controls (those stay behind the full gate on
 * /merchant/subscription, reachable from here for the actions that remain
 * available in each state).
 */

const COPY: Partial<Record<OrgAccessState, { title: string; body: string; ctaHref: string; ctaLabel: string; tone: "amber" | "red" }>> = {
  APPROVED_BILLING_REQUIRED: {
    title: "Finish setting up billing",
    body: "Your organization was approved by Finix, but WGC Platform subscription billing hasn't been set up yet. Add a billing method to unlock full dashboard access.",
    ctaHref: "/merchant/subscription",
    ctaLabel: "Set Up Billing",
    tone: "amber",
  },
  PAST_DUE_IN_GRACE: {
    title: "Payment past due",
    body: "Your last WGC subscription payment didn't go through. You still have full access during the grace period — please update your billing method before it ends to avoid restrictions.",
    ctaHref: "/merchant/subscription",
    ctaLabel: "Update Billing Method",
    tone: "amber",
  },
  PAST_DUE_EXPIRED: {
    title: "Access restricted — payment past due",
    body: "Your WGC subscription payment is past due and the grace period has ended. Full dashboard access is restricted until billing is resolved. Update your billing method to restore access immediately.",
    ctaHref: "/merchant/subscription",
    ctaLabel: "Update Billing Method",
    tone: "red",
  },
  CANCELED: {
    title: "Subscription canceled",
    body: "Your WGC Platform subscription has been canceled, so full dashboard access is currently restricted. Reactivate your subscription to restore access.",
    ctaHref: "/merchant/subscription",
    ctaLabel: "Reactivate Subscription",
    tone: "amber",
  },
  SUSPENDED: {
    title: "Account suspended",
    body: "This organization's account has been suspended by WGC Payments. Contact support for details on what's needed to restore access.",
    ctaHref: "/merchant/support",
    ctaLabel: "Contact Support",
    tone: "red",
  },
};

export default async function BillingStatusPage() {
  let auth;
  try {
    auth = await requireMerchantSession(true);
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/login");
    throw err;
  }

  const state = auth.orgAccessState ?? "NO_GATE";
  // Full access is not restricted — nothing to explain here; send the user
  // back to the normal dashboard rather than showing a status screen.
  if (state === "NO_GATE" || state === "TRIALING_OR_ACTIVE") {
    redirect("/merchant");
  }

  const copy = COPY[state];
  if (!copy) redirect("/merchant/subscription");

  const isRed = copy.tone === "red";

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <div className={`w-12 h-12 mx-auto mb-4 rounded-full flex items-center justify-center ${isRed ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"}`}>
          <span className="text-xl font-bold">!</span>
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">{copy.title}</h1>
        <p className="text-sm text-slate-500 mb-6">{copy.body}</p>
        <div className="flex items-center justify-center gap-3">
          <Link href={copy.ctaHref} className="px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800">
            {copy.ctaLabel}
          </Link>
          {copy.ctaHref !== "/merchant/support" && (
            <Link href="/merchant/support" className="px-4 py-2 rounded-full border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              Contact Support
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
