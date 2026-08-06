import { CreditCard } from "lucide-react";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { hasPermission } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import StateBadge from "@/components/merchant/StateBadge";
import ComingSoon from "@/components/merchant/ComingSoon";
import { formatDateCDT, formatDateTimeCDT } from "@/lib/formatDateTimeCDT";
import RefreshPricingButton from "@/components/merchant/RefreshPricingButton";
import { WGC_PRICING } from "@/lib/giving/feeCalculator";
import CancelSubscriptionButton from "@/components/billing/CancelSubscriptionButton";
import ActivationForm from "@/components/billing/ActivationForm";
import { createBillingActivationToken } from "@/lib/billing/billingActivation";
import { redirect } from "next/navigation";

function titleCase(s: string | null | undefined) {
  if (!s) return "—";
  return s.charAt(0) + s.slice(1).toLowerCase();
}

const formatDate = formatDateCDT;

export default async function SubscriptionPage() {
  let auth;
  try {
    auth = await requireMerchantSession(true); // allowlisted: billing setup/management must remain reachable while restricted
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/login");
    throw err;
  }
  if (!hasPermission(auth, "canViewSubscription")) {
    return (
      <ComingSoon
        icon={CreditCard}
        title="Billing & Subscription"
        description="You don't have permission to view billing details for this organization. Contact your organization owner or admin."
      />
    );
  }
  const canManage = hasPermission(auth, "canManageSubscription");
  const canCancel = hasPermission(auth, "canCancelSubscription");
  const canViewHistory = hasPermission(auth, "canViewBillingHistory");
  const churchId = auth.churchId;

  const [church, subscription, billingAccount, entitlement, pricing, charges] = await Promise.all([
    prisma.church.findUnique({ where: { id: churchId } }),
    prisma.wgcSubscription.findUnique({ where: { organizationId: churchId } }),
    prisma.wgcBillingAccount.findUnique({ where: { organizationId: churchId } }),
    prisma.promotionEntitlement.findFirst({
      where: { organizationId: churchId, status: { in: ["ACTIVE", "ENDING_SOON", "AWAITING_BILLING_SETUP"] } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.churchPricing.findUnique({ where: { churchId } }),
    canViewHistory
      ? prisma.billingCharge.findMany({ where: { organizationId: churchId }, orderBy: { attemptedAt: "desc" }, take: 25 })
      : Promise.resolve([]),
  ]);

  const plan = subscription ? await prisma.wgcPricingVersion.findUnique({ where: { id: subscription.priceVersionId } }) : null;
  const isPromotional = Boolean(entitlement) && subscription?.status === "TRIALING";

  if (church?.billingSetupStatus === "APPROVED_BILLING_REQUIRED" && !subscription?.finixSubscriptionId) {
    // Only the owner can actually complete activation (mirrors
    // /api/billing/activate's own owner-only check) — a sub-user lands on
    // an informational message instead of a form they'd fail to submit.
    if (!canManage) {
      return (
        <div className="bg-white rounded-2xl border border-amber-200 shadow-sm p-8 max-w-lg">
          <h2 className="text-lg font-bold text-slate-900 mb-2">Finish setting up your WGC Platform subscription</h2>
          <p className="text-sm text-slate-500 mb-6">
            Your account is approved — one step remains before you have full dashboard access. Only your organization owner can complete
            billing setup.
          </p>
          <a href="/support" className="text-blue-600 font-semibold text-sm hover:underline">
            Contact Support
          </a>
        </div>
      );
    }

    // Previously required a separate emailed token link — the owner is
    // already authenticated right here, so generate a fresh activation
    // token on the fly and render the real form directly, instead of a
    // "check your email" dead end. The emailed /activate-subscription/
    // [token] link still works too (e.g. from a device where they aren't
    // already logged in); this is just a second, in-app path to the same
    // flow.
    const activationToken = await createBillingActivationToken(churchId);

    return (
      <ActivationForm
        token={activationToken}
        organizationName={church.name}
        isPromotional={Boolean(entitlement)}
        durationMonths={entitlement?.durationMonths ?? null}
        regularMonthlyAmountCents={entitlement?.normalMonthlyAmountCents ?? 1000}
        embedded
      />
    );
  }

  if (!subscription && !pricing) {
    return (
      <ComingSoon
        icon={CreditCard}
        title="Subscription"
        description="Your WGC Payments plan and billing details will show here once your account is fully set up."
      />
    );
  }

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 mb-6">Billing & Subscription</h2>

      {subscription?.status === "PAST_DUE" && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 mb-6">
          <p className="font-semibold text-red-800 mb-1">Your WGC subscription payment was unsuccessful.</p>
          <p className="text-sm text-red-700">
            Please update your billing method{subscription.gracePeriodEndsAt ? ` by ${formatDate(subscription.gracePeriodEndsAt)}` : ""} to
            avoid account restrictions.
          </p>
        </div>
      )}

      {subscription && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900">WGC Platform Subscription</h3>
            <StateBadge state={isPromotional ? "Promotional period active" : subscription.status} />
          </div>

          {isPromotional ? (
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4 mb-4 text-sm space-y-1">
              <p><span className="font-semibold">Current platform price:</span> $0/month</p>
              <p><span className="font-semibold">Regular platform price:</span> {formatCents(entitlement?.normalMonthlyAmountCents ?? 1000)}/month</p>
              <p><span className="font-semibold">Promotion:</span> Six Months Free</p>
              <p><span className="font-semibold">Promotion started:</span> {formatDate(subscription.trialStartsAt)}</p>
              <p><span className="font-semibold">Promotion ends:</span> {formatDate(subscription.trialEndsAt)}</p>
              <p><span className="font-semibold">First scheduled charge:</span> {formatDate(subscription.firstChargeAt)}</p>
              <p className="text-xs text-emerald-700 pt-1">
                Your WGC platform fee is waived during the promotional period. Standard payment-processing and other applicable
                transaction fees still apply. After the promotional period, your WGC Platform subscription will automatically renew at{" "}
                {formatCents(entitlement?.normalMonthlyAmountCents ?? 1000)}/month until canceled.
              </p>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-4 text-sm">
            <Row label="Plan" value={plan?.planName || "—"} />
            <Row label="Price" value={`${formatCents(subscription.amountCents)} / ${titleCase(subscription.billingInterval)}`} />
            <Row label="Next Billing Date" value={formatDate(subscription.nextChargeAt)} />
            <Row label="Last Payment" value={formatDate(subscription.lastChargeAt)} />
            {subscription.canceledAt && <Row label="Canceled" value={formatDate(subscription.canceledAt)} />}
            {billingAccount?.billingMethodType && (
              <Row
                label="Billing Method"
                value={
                  billingAccount.cardBrand
                    ? `${billingAccount.cardBrand} ••••${billingAccount.cardLast4 ?? ""}`
                    : billingAccount.bankLast4
                      ? `Bank •••• ${billingAccount.bankLast4}`
                      : titleCase(billingAccount.billingMethodType)
                }
              />
            )}
          </div>

          {subscription.status !== "CANCELED" && (canManage || canCancel) && (
            <div className="mt-6 pt-4 border-t border-slate-100 flex gap-3">
              {canCancel && <CancelSubscriptionButton />}
            </div>
          )}
        </div>
      )}

      {canViewHistory && charges.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900">Billing History</h3>
            <p className="text-xs text-slate-400 mt-0.5">Your organization&rsquo;s WGC platform-subscription charges only.</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
              <tr>
                <th className="text-left px-6 py-2">Date</th>
                <th className="text-left px-6 py-2">Type</th>
                <th className="text-left px-6 py-2">Amount</th>
                <th className="text-left px-6 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {charges.map((c) => (
                <tr key={c.id}>
                  <td className="px-6 py-2">{formatDate(c.succeededAt ?? c.attemptedAt)}</td>
                  <td className="px-6 py-2">{titleCase(c.chargeType.replace(/_/g, " "))}</td>
                  <td className="px-6 py-2">{formatCents(c.amountCents)}</td>
                  <td className="px-6 py-2"><StateBadge state={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pricing && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Processing Rates</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {pricing.updatedAt && (
                  <>Last updated {formatDateTimeCDT(pricing.updatedAt)}</>
                )}
              </p>
            </div>
            <RefreshPricingButton />
          </div>

          {/* Section 1: Donor Covers */}
          <div className="mb-5">
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3">
              When the Donor Covers the Processing Fee
            </p>
            <div className="space-y-3">
              <RateRow
                label="Card Fee Charged to Organization"
                rate="0%"
              />
              <RateRow
                label="ACH Fee Charged to Organization"
                rate="$0.00"
              />
            </div>
            <p className="text-xs text-slate-400 mt-3">
              When the donor covers the processing fee, no processing fee is deducted
              from the organization&rsquo;s donation proceeds.
            </p>
          </div>

          <div className="border-t border-slate-100 my-4" />

          {/* Section 2: Donor Does Not Cover */}
          <div>
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3">
              When the Donor Does Not Cover the Processing Fee
            </p>
            <div className="space-y-3">
              <RateRow
                label="Card fee charged to organization"
                rate={`${(WGC_PRICING.organizationPaid.nonAmexCardBasisPoints / 100).toFixed(1)}% + ${formatCents(WGC_PRICING.organizationPaid.cardFixedFeeCents)}`}
              />
              <RateRow
                label="ACH Fee charged to organization"
                rate={`${formatCents(WGC_PRICING.organizationPaid.achFixedFeeCents)}`}
              />
            </div>
            <p className="text-xs text-slate-400 mt-3">
              When the donor does not cover the processing fee, the applicable processing
              fee is deducted from the organization&rsquo;s donation proceeds.
            </p>
          </div>
        </div>
      )}

      {/* Invoice-feature billing: hidden entirely while disabled, per spec —
          never show a made-up price. */}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function RateRow({ label, rate, description }: { label: string; rate: string; description?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <div>
        <p className="font-semibold text-slate-800">{label}</p>
        {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
      </div>
      <p className="font-bold text-slate-900 whitespace-nowrap shrink-0">{rate}</p>
    </div>
  );
}
