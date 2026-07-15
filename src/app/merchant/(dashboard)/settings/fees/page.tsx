import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { formatCents } from "@/lib/format";
import { calculateWgcFeeAmounts, WGC_PRICING } from "@/lib/giving/feeCalculator";

export default async function FeesSettingsPage() {
  const session = await getSession();
  const churchId = session!.churchId!;
  const pricing = await prisma.churchPricing.findUnique({ where: { churchId } });

  const cardPct = (WGC_PRICING.organizationPaid.nonAmexCardBasisPoints / 100);
  const cardFixed = WGC_PRICING.organizationPaid.cardFixedFeeCents;
  const achFixed = WGC_PRICING.organizationPaid.achFixedFeeCents;

  const exampleDonationCents = 10000;
  
  const feeResult = calculateWgcFeeAmounts({
    donationAmountCents: exampleDonationCents,
    paymentMethod: "CARD",
    cardBrand: null,
    donorCoversFee: true,
  });

  const totalCents = feeResult.amountToChargeCents;
  const estimatedFeeCents = feeResult.supplementalFeeCents;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <h3 className="text-sm font-bold text-slate-900 mb-1">Fees</h3>
      <p className="text-xs text-slate-500 mb-6">
        Processing fees are set by WGC's payment processing agreement and cannot be edited here.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="p-4 rounded-xl border border-slate-100">
          <p className="text-xs text-slate-500 mb-1">Card Percentage Fee</p>
          <p className="text-lg font-bold text-slate-900">{cardPct}%</p>
        </div>
        <div className="p-4 rounded-xl border border-slate-100">
          <p className="text-xs text-slate-500 mb-1">Card Fixed Fee</p>
          <p className="text-lg font-bold text-slate-900">{formatCents(cardFixed)}</p>
        </div>
        <div className="p-4 rounded-xl border border-slate-100">
          <p className="text-xs text-slate-500 mb-1">ACH Fee</p>
          <p className="text-lg font-bold text-slate-900">{formatCents(achFixed)}</p>
        </div>
        <div className="p-4 rounded-xl border border-slate-100">
          <p className="text-xs text-slate-500 mb-1">Pricing Plan</p>
          <p className="text-lg font-bold text-slate-900">{pricing?.pricingPlanName || "Standard"}</p>
        </div>
      </div>

      <div className="p-4 rounded-xl bg-slate-50 mb-6">
        <p className="text-xs font-semibold text-slate-500 mb-3">Example Calculation (Estimate)</p>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-slate-600">Donation</span><span className="font-semibold text-slate-800">{formatCents(exampleDonationCents)}</span></div>
          <div className="flex justify-between"><span className="text-slate-600">Estimated Processing Fees</span><span className="font-semibold text-slate-800">{formatCents(estimatedFeeCents)}</span></div>
          <div className="flex justify-between"><span className="text-slate-600">If Donor Covers Fees, Total Charged</span><span className="font-semibold text-slate-800">{formatCents(totalCents)}</span></div>
          <div className="flex justify-between"><span className="text-slate-600">Estimated Net to Organization</span><span className="font-semibold text-slate-800">{formatCents(exampleDonationCents)}</span></div>
        </div>
        <p className="text-xs text-slate-400 mt-3">
          This is an estimate for illustration only. Actual fees depend on the exact payment method, card type, and any donor-covered fee election at the time of the donation.
        </p>
      </div>

      <p className="text-sm text-slate-600 mb-2">Have a question about your pricing plan?</p>
      <Link href="/merchant/support/tickets/new?category=FEES" className="text-sm font-semibold text-blue-600 hover:underline">
        Contact Support
      </Link>
    </div>
  );
}
