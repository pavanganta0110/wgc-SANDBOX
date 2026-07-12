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
import { prisma } from "@/lib/prisma";

export default async function RecurringDonorDrawer({ donorId, churchId }: { donorId: string; churchId: string }) {
  const donor = await prisma.donor.findFirst({ where: { id: donorId, churchId } });
  const subscriptions = await loadSubscriptionCandidates(churchId, { donorId });

  if (!donor || subscriptions.length === 0) {
    return (
      <div className="w-full lg:w-[420px] shrink-0 border-l border-slate-100 bg-white rounded-2xl lg:rounded-none p-6">
        <p className="text-sm text-slate-500">This recurring donor could not be found.</p>
      </div>
    );
  }

  const active = subscriptions.filter((s) => s.displayStatus === "ACTIVE");
  const monthlyValueCents = active.reduce((sum, s) => sum + s.monthlyValueCents, 0);
  const nextBillingDate = active
    .map((s) => s.nextBillingDate)
    .filter((d): d is Date => !!d)
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const lastPayment = subscriptions
    .map((s) => s.lastPayment)
    .filter((p): p is { date: Date; amountCents: number; state: string } => !!p)
    .sort((a, b) => b.date.getTime() - a.date.getTime())[0] ?? null;
  const lifetimeCents = subscriptions.reduce((sum, s) => sum + s.lifetimeCollectedCents, 0);
  const failedPayments = subscriptions.reduce((sum, s) => sum + s.failedAttempts, 0);
  const attentionReasons = [...new Set(subscriptions.flatMap((s) => s.attentionReasons))];
  const donorName = donor.anonymousPreference ? "Anonymous Donor" : donor.name || "—";
  const overallStatus = active.length > 0 ? (subscriptions.length > active.length ? "MIXED" : "ACTIVE") : subscriptions.some((s) => s.displayStatus === "PAST_DUE") ? "PAST_DUE" : "CANCELED";

  return (
    <div className="w-full lg:w-[420px] shrink-0 bg-white border border-slate-100 rounded-2xl shadow-sm h-fit lg:sticky lg:top-6">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <h3 className="text-sm font-bold text-slate-900">Recurring Donor</h3>
        <div className="flex items-center gap-2">
          <ViewAllDetailsButton href={`/merchant/recurring-donors/${donor.id}`} />
          <ClosePanelButton />
        </div>
      </div>

      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <p className="text-lg font-bold text-slate-900">{donorName}</p>
          <StateBadge state={overallStatus} />
        </div>
        <div className="space-y-1.5 text-sm">
          <Row label="Donor ID" value={<CopyableIdBadge id={donor.id} />} />
        </div>
      </div>

      {attentionReasons.length > 0 && (
        <div className="px-5 py-3 border-b border-slate-100 bg-amber-50 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">{attentionReasons.join(" · ")}</p>
        </div>
      )}

      <Section title="Summary">
        <Row label="Monthly Recurring Value" value={formatCents(monthlyValueCents)} />
        <Row label="Annualized Recurring Value" value={formatCents(monthlyValueCents * 12)} />
        <Row label="Active Subscriptions" value={String(active.length)} />
        <Row label="Total Subscriptions" value={String(subscriptions.length)} />
        <Row label="Next Billing Date" value={nextBillingDate ? formatDateCDT(nextBillingDate) : "—"} />
        <Row label="Last Successful Payment" value={lastPayment ? `${formatCents(lastPayment.amountCents)} on ${formatDateCDT(lastPayment.date)}` : "—"} />
        <Row label="Failed Recurring Payments" value={String(failedPayments)} />
        <Row label="Lifetime Recurring Donated" value={formatCents(lifetimeCents)} />
      </Section>

      <Section title="Contact Information">
        <Row label="Email" value={donor.email || "—"} />
        <Row label="Phone" value={donor.phone || "—"} />
        {(donor.city || donor.state) && <Row label="Location" value={[donor.city, donor.state].filter(Boolean).join(", ")} />}
      </Section>

      <Section title={`Active Recurring Donations (${active.length})`}>
        {active.length === 0 ? (
          <p className="text-sm text-slate-500">No active recurring donation schedules.</p>
        ) : (
          <div className="space-y-2">
            {active.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-sm">
                <div>
                  <p className="text-slate-700">{frequencyLabel(s.billingInterval)}</p>
                  <p className="text-xs text-slate-400">Next: {s.nextBillingDate ? formatDateCDT(s.nextBillingDate) : "—"}</p>
                </div>
                <p className="font-semibold text-slate-900">{formatCents(s.amountCents)}</p>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Payment Methods">
        {subscriptions[0]?.paymentMethod ? (
          <Row
            label={subscriptions[0].paymentMethod.brand || (subscriptions[0].paymentMethod.type === "BANK_ACCOUNT" ? "Bank Account" : "Card")}
            value={`•••• ${subscriptions[0].paymentMethod.last4 || "—"}`}
          />
        ) : (
          <p className="text-sm text-slate-500">No payment method on file.</p>
        )}
      </Section>

      <Section title="Related Resources" last>
        <div className="flex flex-col gap-1.5 text-sm">
          <Link href={`/merchant/donors/${donor.id}`} className="text-blue-600 hover:underline">Donor Profile</Link>
          <Link href={`/merchant/recurring-donors/${donor.id}?tab=subscriptions`} className="text-blue-600 hover:underline">Subscriptions</Link>
          <Link href={`/merchant/recurring-donors/${donor.id}?tab=payments`} className="text-blue-600 hover:underline">Recurring Payments</Link>
          <Link href={`/merchant/recurring-donors/${donor.id}?tab=giving-links`} className="text-blue-600 hover:underline">Giving Links</Link>
          <Link href={`/merchant/recurring-donors/${donor.id}?tab=refunds`} className="text-blue-600 hover:underline">Refunds</Link>
          <Link href={`/merchant/recurring-donors/${donor.id}?tab=bank-returns`} className="text-blue-600 hover:underline">Bank Returns</Link>
          <Link href={`/merchant/recurring-donors/${donor.id}?tab=disputes`} className="text-blue-600 hover:underline">Disputes</Link>
        </div>
      </Section>
    </div>
  );
}
