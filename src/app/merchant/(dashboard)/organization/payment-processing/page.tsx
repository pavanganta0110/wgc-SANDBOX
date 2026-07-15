import { getSession } from "@/lib/auth/session";
import { loadOrganizationProfile } from "@/lib/organization/organizationProfileLoader";
import StateBadge from "@/components/merchant/StateBadge";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function centsToDollars(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function OrganizationPaymentProcessingPage() {
  const session = await getSession();
  const profile = await loadOrganizationProfile(session!.churchId!);
  if (!profile) return null;
  const { church, onboarding } = profile;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h3 className="text-sm font-bold text-slate-900 mb-4">Processing Configuration</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <Row label="MCC" value={onboarding?.mcc || "—"} />
          <Row label="Statement Descriptor" value={onboarding?.defaultStatementDescriptor || "—"} />
          <Row label="Max Transaction Amount" value={centsToDollars(onboarding?.maxTransactionAmountCents)} />
          <Row label="Average Card Transfer" value={centsToDollars(onboarding?.averageCardTransferAmountCents)} />
          <Row label="Average ACH Transfer" value={centsToDollars(onboarding?.averageAchTransferAmountCents)} />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h3 className="text-sm font-bold text-slate-900 mb-4">Status</h3>
        <div className="flex flex-wrap gap-6 text-sm">
          <div>
            <p className="text-xs text-slate-500 mb-1">Processing</p>
            <StateBadge state={onboarding?.processingEnabled ? "ENABLED" : "DISABLED"} />
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Settlement</p>
            <StateBadge state={onboarding?.settlementEnabled ? "ENABLED" : "DISABLED"} />
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Bank Account</p>
            <StateBadge state={onboarding?.bankInstrumentEnabled ? "ENABLED" : "DISABLED"} />
          </div>
        </div>
        {!church.finixMerchantId && (
          <p className="text-xs text-amber-700 mt-4">This organization does not yet have an active payment processing account.</p>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <p className="text-xs text-slate-500">
          Fee rates are shown under <a href="/merchant/settings/fees" className="text-blue-600 hover:underline">Settings &gt; Fees</a>. Payment method availability is shown under <a href="/merchant/settings/payment-methods" className="text-blue-600 hover:underline">Settings &gt; Payment Methods</a>.
        </p>
      </div>
    </div>
  );
}
