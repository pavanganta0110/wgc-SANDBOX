import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/auth/permissions";
import { formatCents } from "@/lib/format";
import { formatDateCDT, formatCalendarDateUTC } from "@/lib/formatDateTimeCDT";
import type { MerchantAuthContext } from "@/lib/auth/requireMerchantSession";

/**
 * Compact subscription/promotion summary for Profile / Account Overview.
 * Permission-gated: owner sees full detail; admin only with explicit
 * canViewSubscription (an override, not a role default — see roles.ts);
 * fundraiser/viewer get a generic message only, never payment method,
 * charge history, discounts, or cancellation controls.
 */
export default async function SubscriptionSummaryCard({ auth }: { auth: MerchantAuthContext }) {
  if (!hasPermission(auth, "canViewSubscription")) {
    // Only shown at all if billing currently affects the organization
    // (restricted access state) — otherwise this card is simply omitted
    // for a user without billing visibility, rather than showing anything.
    if (auth.orgAccessState && auth.orgAccessState !== "NO_GATE" && auth.orgAccessState !== "TRIALING_OR_ACTIVE") {
      return (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h3 className="text-sm font-bold text-slate-900 mb-1">Account Access</h3>
          <p className="text-sm text-slate-500">
            Your organization&rsquo;s billing needs attention. Contact your organization owner or admin for details.
          </p>
        </div>
      );
    }
    return null;
  }

  const [subscription, entitlement] = await Promise.all([
    prisma.wgcSubscription.findUnique({ where: { organizationId: auth.churchId } }),
    prisma.promotionEntitlement.findFirst({
      where: { organizationId: auth.churchId, status: { in: ["ACTIVE", "ENDING_SOON", "AWAITING_BILLING_SETUP"] } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (!subscription) return null;

  const isPromotional = Boolean(entitlement) && subscription.status === "TRIALING";
  const regularPriceCents = entitlement?.normalMonthlyAmountCents ?? subscription.amountCents;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-900">WGC Platform Subscription</h3>
        <Link href="/merchant/subscription" className="text-xs font-semibold text-blue-600 hover:underline">
          Manage Billing &amp; Subscription
        </Link>
      </div>

      {subscription.status === "PAST_DUE" && (
        <p className="text-xs font-semibold text-red-600 mb-2">
          Payment past due{subscription.gracePeriodEndsAt ? ` — resolve by ${formatDateCDT(subscription.gracePeriodEndsAt)}` : ""}.
        </p>
      )}

      {isPromotional ? (
        <div className="text-sm space-y-1">
          <p>Plan: WGC Platform</p>
          <p>Current price: $0/month</p>
          <p>Regular price: {formatCents(regularPriceCents)}/month</p>
          <p>Promotion: Six Months Free</p>
          <p>Promotion ends: {subscription.trialEndsAt ? formatDateCDT(subscription.trialEndsAt) : "—"}</p>
          <p>First charge: {subscription.firstChargeAt ? formatDateCDT(subscription.firstChargeAt) : "—"}</p>
          <p className="text-slate-500">Status: Promotional period active</p>
        </div>
      ) : (
        <div className="text-sm space-y-1">
          <p>Plan: WGC Platform</p>
          <p>Price: {formatCents(subscription.amountCents)}/month</p>
          <p>Next payment: {subscription.nextChargeAt ? formatCalendarDateUTC(subscription.nextChargeAt) : "—"}</p>
          <p className="text-slate-500">Status: {subscription.status === "ACTIVE" ? "Active" : subscription.status}</p>
        </div>
      )}
    </div>
  );
}
