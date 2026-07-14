import { CreditCard } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import StateBadge from "@/components/merchant/StateBadge";
import ComingSoon from "@/components/merchant/ComingSoon";
import { formatDateCDT, formatDateTimeCDT } from "@/lib/formatDateTimeCDT";
import RefreshPricingButton from "@/components/merchant/RefreshPricingButton";

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
      <h2 className="text-lg font-bold text-slate-900 mb-6">Billing Plan</h2>

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
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">WGC Processing Rates</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                These rates determine how processing fees are applied based on whether
                the donor chooses to cover the fee.
                {pricing.updatedAt && (
                  <> · Last updated {formatDateTimeCDT(pricing.updatedAt)}</>
                )}
              </p>
            </div>
            <RefreshPricingButton />
          </div>

          {/* Section 1: Donor Covers */}
          <div className="mb-5">
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3">
              When Donors Cover Processing Fees
            </p>
            <div className="space-y-3">
              <RateRow
                label="Non-American-Express Cards"
                rate="3.00% of the donation amount"
                description="Added to the donor's total when the donor chooses to cover processing fees."
              />
              <RateRow
                label="American Express"
                rate="3.50% of the donation amount"
                description="Added to the donor's total when the donor chooses to cover processing fees."
              />
              <RateRow
                label="ACH"
                rate="$0.25 per transaction"
                description="Added to the donor's total when the donor chooses to cover processing fees."
              />
            </div>
          </div>

          <div className="border-t border-slate-100 my-4" />

          {/* Section 2: Org Covers */}
          <div>
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3">
              When the Organization Covers Processing Fees
            </p>
            <div className="space-y-3">
              <RateRow
                label="Non-American-Express Cards"
                rate="2.30% + $0.30 per transaction"
                description="Deducted from donation proceeds when the donor does not cover the fee."
              />
              <RateRow
                label="American Express"
                rate="3.50% + $0.30 per transaction"
                description="Deducted from donation proceeds when the donor does not cover the fee."
              />
              <RateRow
                label="ACH"
                rate="$0.25 per transaction"
                description="Deducted from donation proceeds when the donor does not cover the fee."
              />
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

function RateRow({ label, rate, description }: { label: string; rate: string; description: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <div>
        <p className="font-semibold text-slate-800">{label}</p>
        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
      </div>
      <p className="font-bold text-slate-900 whitespace-nowrap shrink-0">{rate}</p>
    </div>
  );
}
