import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { formatCents } from "@/lib/format";
import CopyableIdBadge from "@/components/merchant/CopyableIdBadge";
import StateBadge from "@/components/merchant/StateBadge";
import ClosePanelButton from "@/components/merchant/ClosePanelButton";
import { ViewAllDetailsButton } from "@/components/merchant/PaymentDetailActions";
import { Section, Row } from "@/components/merchant/detail/DetailDrawerPrimitives";
import { formatPersonName } from "@/lib/formatPersonName";
import { formatDateTimeCDT as formatDateTime, formatDateCDT } from "@/lib/formatDateTimeCDT";
import { titleCaseFromSnake as titleCase } from "@/lib/finix/displayFormatters";
import { loadDonorDetail } from "@/lib/donors/donorDetail";
import { DONOR_DISPLAY_STATUS_LABELS } from "@/lib/donors/donorStatus";
import DonorNotesList from "@/components/merchant/DonorNotesList";

export default async function DonorDetailPanel({
  donorId,
  churchId,
  canAddNote,
}: {
  donorId: string;
  churchId: string;
  canAddNote: boolean;
}) {
  const detail = await loadDonorDetail(donorId, churchId);

  if (!detail) {
    return (
      <div className="w-full lg:w-[420px] shrink-0 border-l border-slate-100 bg-white rounded-2xl lg:rounded-none p-6">
        <p className="text-sm text-slate-500">This donor could not be found.</p>
      </div>
    );
  }

  const { donor, instruments, aggregates, status, needsAttentionReasons, recentTransfers, activeSubscriptions, notes } = detail;
  const primaryInstrument = instruments[0] ?? null;

  return (
    <div className="w-full lg:w-[420px] shrink-0 bg-white border border-slate-100 rounded-2xl shadow-sm h-fit lg:sticky lg:top-6">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <h3 className="text-sm font-bold text-slate-900">Donor</h3>
        <div className="flex items-center gap-2">
          <ViewAllDetailsButton href={`/merchant/donors/${donor.id}`} />
          <ClosePanelButton />
        </div>
      </div>

      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <p className="text-lg font-bold text-slate-900">
            {donor.anonymousPreference ? "Anonymous Donor" : formatPersonName(donor.name)}
          </p>
          <StateBadge state={status} />
        </div>
        {donor.companyName && <p className="text-sm text-slate-500 mb-2">{donor.companyName}</p>}
        <div className="space-y-1.5 text-sm">
          <Row label="Donor ID" value={<CopyableIdBadge id={donor.id} />} />
          <Row label="Created" value={formatDateTime(donor.createdAt)} />
        </div>
      </div>

      {needsAttentionReasons.length > 0 && (
        <div className="px-5 py-3 border-b border-slate-100 bg-amber-50 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">{needsAttentionReasons.join(" · ")}</p>
        </div>
      )}

      <Section title="Giving Summary">
        <Row label="Total Donated" value={formatCents(aggregates.totalDonatedCents)} />
        <Row label="Net Donated" value={formatCents(aggregates.netDonatedCents)} />
        <Row label="Donation Count" value={String(aggregates.donationCount)} />
        <Row label="Average Donation" value={formatCents(aggregates.averageDonationCents)} />
        <Row label="Largest Donation" value={formatCents(aggregates.largestDonationCents)} />
        <Row label="First Donation" value={aggregates.firstDonationAt ? formatDateCDT(aggregates.firstDonationAt) : "—"} />
        <Row label="Last Donation" value={aggregates.lastDonationAt ? formatDateCDT(aggregates.lastDonationAt) : "—"} />
        <Row label="Active Recurring Donations" value={String(aggregates.activeSubscriptionCount)} />
        {aggregates.refundedAmountCents > 0 && <Row label="Lifetime Refunded" value={formatCents(aggregates.refundedAmountCents)} />}
        {aggregates.returnedAmountCents > 0 && <Row label="Lifetime Returned" value={formatCents(aggregates.returnedAmountCents)} />}
        {aggregates.disputedAmountCents > 0 && <Row label="Lifetime Disputed" value={formatCents(aggregates.disputedAmountCents)} />}
      </Section>

      <Section title="Contact Information">
        <Row label="Email" value={donor.email || "—"} />
        <Row label="Phone" value={donor.phone || "—"} />
        {(donor.city || donor.state) && <Row label="Location" value={[donor.city, donor.state].filter(Boolean).join(", ")} />}
      </Section>

      <Section title={`Recent Donations (${recentTransfers.length})`}>
        {recentTransfers.length === 0 ? (
          <p className="text-sm text-slate-500">This donor&apos;s donation history will appear here.</p>
        ) : (
          <div className="space-y-2">
            {recentTransfers.map((t) => (
              <Link
                key={t.id}
                href={`/merchant/transactions/payments?id=${t.finixTransferId}`}
                className="flex items-center justify-between text-sm hover:bg-slate-50 -mx-2 px-2 py-1 rounded-lg"
              >
                <div>
                  <p className="text-slate-700">{formatDateCDT(t.createdAtFinix)}</p>
                  <StateBadge state={t.state} />
                </div>
                <p className="font-semibold text-slate-900">{formatCents(t.amountCents ?? 0)}</p>
              </Link>
            ))}
          </div>
        )}
      </Section>

      {activeSubscriptions.length > 0 && (
        <Section title="Recurring Donations">
          <div className="space-y-2">
            {activeSubscriptions.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-sm">
                <div>
                  <p className="text-slate-700">{titleCase(s.billingInterval)}</p>
                  <p className="text-xs text-slate-400">Next: {formatDateCDT(s.nextBillingDate)}</p>
                </div>
                <p className="font-semibold text-slate-900">{formatCents(s.amountCents ?? 0)}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {primaryInstrument && (
        <Section title="Payment Methods">
          <Row
            label={primaryInstrument.cardBrand || (primaryInstrument.bankLast4 ? "Bank Account" : "Unknown")}
            value={`•••• ${primaryInstrument.cardLast4 || primaryInstrument.bankLast4 || "—"}`}
          />
          {instruments.length > 1 && <p className="text-xs text-slate-400 mt-1">+{instruments.length - 1} more</p>}
        </Section>
      )}

      <Section title="Internal Notes" last>
        <DonorNotesList donorId={donor.id} initialNotes={notes} editable={canAddNote} limit={5} />
      </Section>
    </div>
  );
}
