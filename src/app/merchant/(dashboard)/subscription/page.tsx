import { CreditCard } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import StateBadge from "@/components/merchant/StateBadge";
import ComingSoon from "@/components/merchant/ComingSoon";
import { formatDateCDT } from "@/lib/formatDateTimeCDT";

function titleCase(s: string | null | undefined) {
  if (!s) return "—";
  return s.charAt(0) + s.slice(1).toLowerCase();
}

export default async function SubscriptionPage() {
  const session = await getSession();
  const churchId = session!.churchId!;

  const [churchSubscription, pricing] = await Promise.all([
    prisma.churchSubscription.findFirst({ where: { churchId }, orderBy: { createdAt: "desc" } }),
    prisma.churchPricing.findUnique({ where: { churchId } }),
  ]);

  const plan = churchSubscription
    ? await prisma.subscriptionPlan.findUnique({ where: { id: churchSubscription.subscriptionPlanId } })
    : null;

  if (!churchSubscription && !pricing) {
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
      <h2 className="text-lg font-bold text-slate-900 mb-6">Subscription</h2>

      {churchSubscription && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-900">WGC Payments Plan</h3>
            <StateBadge state={churchSubscription.state} />
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <Row label="Plan" value={plan?.name || "—"} />
            <Row
              label="Billing Amount"
              value={`${formatCents(churchSubscription.amountCents)} / ${titleCase(churchSubscription.billingInterval)}`}
            />
            <Row label="Started" value={formatDate(churchSubscription.startedAt)} />
            <Row label="Next Billing Date" value={formatDate(churchSubscription.nextBillingDate)} />
            {churchSubscription.canceledAt && (
              <Row label="Canceled" value={formatDate(churchSubscription.canceledAt)} />
            )}
            {churchSubscription.paymentMethodType && (
              <Row
                label="Payment Method"
                value={
                  churchSubscription.cardBrand
                    ? `${churchSubscription.cardBrand} ••••${churchSubscription.cardLast4 ?? ""}`
                    : churchSubscription.bankLast4
                      ? `Bank •••• ${churchSubscription.bankLast4}`
                      : titleCase(churchSubscription.paymentMethodType)
                }
              />
            )}
          </div>
        </div>
      )}

      {pricing && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h3 className="text-sm font-bold text-slate-900 mb-4">Processing Rates</h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs text-slate-500 mb-1">Card Rate</p>
              <p className="text-lg font-bold text-slate-900">
                {pricing.cardPercentageFee != null ? `${pricing.cardPercentageFee}%` : "—"}
              </p>
              {pricing.cardFixedFeeCents != null && (
                <p className="text-xs text-slate-400">+ {formatCents(pricing.cardFixedFeeCents)} per transaction</p>
              )}
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">ACH Fixed Fee</p>
              <p className="text-lg font-bold text-slate-900">
                {pricing.achFixedFeeCents != null ? formatCents(pricing.achFixedFeeCents) : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Plan Name</p>
              <p className="text-lg font-bold text-slate-900">{pricing.pricingPlanName || "Standard"}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const formatDate = formatDateCDT;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="font-semibold text-slate-800">{value}</p>
    </div>
  );
}
