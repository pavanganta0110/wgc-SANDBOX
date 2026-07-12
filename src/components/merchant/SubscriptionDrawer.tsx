import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { formatCents } from "@/lib/format";
import CopyableIdBadge from "@/components/merchant/CopyableIdBadge";
import StateBadge from "@/components/merchant/StateBadge";
import ClosePanelButton from "@/components/merchant/ClosePanelButton";
import { ViewAllDetailsButton } from "@/components/merchant/PaymentDetailActions";
import { Section, Row } from "@/components/merchant/detail/DetailDrawerPrimitives";
import { formatDateCDT } from "@/lib/formatDateTimeCDT";
import { frequencyLabel } from "@/lib/subscriptions/subscriptionStatus";
import { loadSubscriptionCandidates } from "@/lib/subscriptions/subscriptionAggregates";
import { getSession } from "@/lib/auth/session";
import { getSubscriptionPermissions } from "@/lib/subscriptions/subscriptionPermissions";
import SubscriptionActions from "@/components/merchant/SubscriptionActions";

export default async function SubscriptionDrawer({ subscriptionId, churchId }: { subscriptionId: string; churchId: string }) {
  const [s, session] = await Promise.all([loadSubscriptionCandidates(churchId, { id: subscriptionId }).then((rows) => rows[0]), getSession()]);
  const permissions = getSubscriptionPermissions(session?.role);

  if (!s) {
    return (
      <div className="w-full lg:w-[420px] shrink-0 border-l border-slate-100 bg-white rounded-2xl lg:rounded-none p-6">
        <p className="text-sm text-slate-500">This subscription could not be found.</p>
      </div>
    );
  }

  return (
    <div className="w-full lg:w-[420px] shrink-0 bg-white border border-slate-100 rounded-2xl shadow-sm h-fit lg:sticky lg:top-6">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <h3 className="text-sm font-bold text-slate-900">Subscription</h3>
        <div className="flex items-center gap-2">
          <ViewAllDetailsButton href={`/merchant/subscriptions/${s.id}`} />
          <ClosePanelButton />
        </div>
      </div>

      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <p className="text-lg font-bold text-slate-900">{s.donorName}</p>
          <StateBadge state={s.displayStatus} />
        </div>
        <div className="space-y-1.5 text-sm">
          <Row label="Subscription ID" value={<CopyableIdBadge id={s.finixSubscriptionId} />} />
          <Row label="Created" value={formatDateCDT(s.createdAt)} />
        </div>
      </div>

      {s.requiresAttention && (
        <div className="px-5 py-3 border-b border-slate-100 bg-amber-50 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">{s.attentionReasons.join(" · ")}</p>
        </div>
      )}

      <div className="px-5 py-3 border-b border-slate-100">
        <SubscriptionActions
          subscriptionId={s.id}
          finixSubscriptionId={s.finixSubscriptionId}
          displayStatus={s.displayStatus}
          currentAmountCents={s.amountCents}
          currentBillingInterval={s.billingInterval}
          canCancel={permissions.canCancel}
          canUpdateAmount={permissions.canUpdateAmount}
          canUpdateFrequency={permissions.canUpdateFrequency}
          canSendPaymentUpdateLink={permissions.canSendPaymentUpdateLink}
        />
      </div>

      <Section title="Summary">
        <Row label="Amount" value={formatCents(s.amountCents)} />
        <Row label="Frequency" value={frequencyLabel(s.billingInterval)} />
        <Row label="Monthly Value" value={formatCents(s.monthlyValueCents)} />
        <Row label="Donor" value={<Link href={`/merchant/donors/${s.donorId}`} className="text-blue-600 hover:underline">{s.donorName}</Link>} />
        <Row label="Next Billing Date" value={s.nextBillingDate ? formatDateCDT(s.nextBillingDate) : "—"} />
        <Row label="Lifetime Collected" value={formatCents(s.lifetimeCollectedCents)} />
      </Section>

      <Section title="Payment Method">
        {s.paymentMethod ? (
          <Row label={s.paymentMethod.brand || "Bank Account"} value={`•••• ${s.paymentMethod.last4 || "—"}`} />
        ) : (
          <p className="text-sm text-slate-500">No payment method on file.</p>
        )}
      </Section>

      <Section title="Related Resources" last>
        <div className="flex flex-col gap-1.5 text-sm">
          <Link href={`/merchant/donors/${s.donorId}`} className="text-blue-600 hover:underline">Donor</Link>
          {s.donorId && <Link href={`/merchant/recurring-donors/${s.donorId}`} className="text-blue-600 hover:underline">Recurring Donor</Link>}
          <Link href={`/merchant/subscriptions/${s.id}?tab=payments`} className="text-blue-600 hover:underline">Payments</Link>
          {s.givingLinkId && <Link href={`/merchant/giving-links/${s.givingLinkId}`} className="text-blue-600 hover:underline">Giving Link</Link>}
        </div>
      </Section>
    </div>
  );
}
