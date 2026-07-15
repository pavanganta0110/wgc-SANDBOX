import { formatCents } from "@/lib/format";
import CopyableIdBadge from "@/components/merchant/CopyableIdBadge";
import StateBadge from "@/components/merchant/StateBadge";
import ClosePanelButton from "@/components/merchant/ClosePanelButton";
import { formatPersonName } from "@/lib/formatPersonName";
import Link from "next/link";
import { PanelNavArrows, PaymentMoreMenu, PinButton } from "@/components/merchant/PaymentDetailActions";
import ViewAllDetailsLink from "@/components/merchant/ViewAllDetailsLink";
import { formatDateTimeCDT as formatDateTime } from "@/lib/formatDateTimeCDT";
import { titleCaseFromSnake as titleCase } from "@/lib/finix/displayFormatters";
import { Row, Section } from "@/components/merchant/detail/DetailDrawerPrimitives";
import { TransactionTimeline } from "@/components/merchant/detail/TransactionTimeline";
import { loadDisputeDetail } from "@/lib/finix/disputeDetail";
import { buildDisputeTimeline } from "@/lib/finix/disputeTimeline";
import { resolveDisputeDisplayStatus } from "@/lib/finix/disputeStatus";
import DisputeDeadlineBanner from "@/components/merchant/DisputeDeadlineBanner";
import DisputeFinancialImpactCard from "@/components/merchant/DisputeFinancialImpactCard";

export default async function DisputeDetailPanel({
  disputeId,
  churchId,
}: {
  disputeId: string;
  churchId: string;
}) {
  const detail = await loadDisputeDetail(disputeId, churchId);

  if (!detail) {
    return (
      <div className="w-full lg:w-[420px] shrink-0 border-l border-slate-100 bg-white rounded-2xl lg:rounded-none p-6">
        <p className="text-sm text-slate-500">This dispute could not be found.</p>
      </div>
    );
  }

  const { dispute, transfer, instrument, donor, settlement, deposit } = detail;
  const displayStatus = resolveDisputeDisplayStatus(dispute);
  const timeline = buildDisputeTimeline(detail);
  const locked = Boolean(dispute.respondedAt);

  return (
    <div className="w-full lg:w-[420px] shrink-0 bg-white border border-slate-100 rounded-2xl shadow-sm h-fit lg:sticky lg:top-6">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <PanelNavArrows />
        <ViewAllDetailsLink href={`/merchant/disputes/${dispute.finixDisputeId}`} />
        <ClosePanelButton />
      </div>

      {/* Summary */}
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
          <span>Dispute · {formatDateTime(dispute.createdAtFinix)}</span>
          <div className="flex items-center gap-1.5">
            <CopyableIdBadge id={dispute.finixDisputeId} />
            <PinButton />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{formatCents(dispute.amountCents ?? 0)}</span>
            <span className="text-sm font-semibold text-slate-400">{dispute.currency || "USD"}</span>
          </div>
          <StateBadge state={displayStatus} />
        </div>
        <PaymentMoreMenu />

        <div className="mt-3">
          <DisputeDeadlineBanner evidenceDueAt={dispute.evidenceDueAt} respondedAt={dispute.respondedAt} />
        </div>

        <div className="mt-3 space-y-1.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Donor</span>
            <span className="font-semibold text-slate-700">
              {formatPersonName(donor?.name, instrument?.accountHolderName)}
            </span>
          </div>
          {dispute.finixTransferId && (
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Payment</span>
              <CopyableIdBadge id={dispute.finixTransferId} label={dispute.finixTransferId} variant="link" />
            </div>
          )}
        </div>
      </div>

      {/* Financial Impact */}
      <div className="px-5 py-4 border-b border-slate-100">
        <DisputeFinancialImpactCard
          originalAmountCents={transfer?.amountCents ?? null}
          disputedAmountCents={dispute.amountCents}
          displayStatus={displayStatus}
        />
      </div>

      <Section title="Timeline">
        <TransactionTimeline events={timeline} />
      </Section>

      <Section title="Dispute Details">
        <Row label="Reason" value={titleCase(dispute.reason)} />
        <Row label="Status" value={titleCase(displayStatus)} />
        {dispute.outcome && <Row label="Outcome" value={titleCase(dispute.outcome)} />}
        <Row label="Evidence Due" value={formatDateTime(dispute.evidenceDueAt)} />
        <Row label="Responded" value={formatDateTime(dispute.respondedAt)} />
        <Row label="Resolved" value={formatDateTime(dispute.resolvedAt)} />
      </Section>

      {instrument && (
        <Section title="Payment Instrument">
          <Row label="Type" value={instrument.cardBrand || (instrument.bankLast4 ? "Bank Account" : instrument.instrumentType || "—")} />
          <Row
            label="Masked Number"
            value={
              instrument.cardLast4 || instrument.bankLast4
                ? `••••${instrument.cardLast4 || instrument.bankLast4}`
                : "—"
            }
          />
          <Row label="Account Holder Name" value={instrument.accountHolderName || "—"} />
        </Section>
      )}

      {(settlement || deposit) && (
        <Section title="Related Settlement / Deposit">
          {settlement && (
            <Row label="Settlement" value={<CopyableIdBadge id={settlement.finixSettlementId} label={settlement.finixSettlementId} variant="link" />} />
          )}
          {deposit && (
            <Row label="Deposit" value={<CopyableIdBadge id={deposit.finixFundingTransferAttemptId} label={deposit.finixFundingTransferAttemptId} variant="link" />} />
          )}
        </Section>
      )}

      <Section title="Quick Actions" last>
        <div className="flex flex-col gap-2">
          {!locked && (
            <Link
              href={`/merchant/disputes/${dispute.finixDisputeId}`}
              className="text-sm font-semibold text-blue-600 hover:underline"
            >
              Manage Evidence
            </Link>
          )}
          <Link
            href={`/merchant/disputes/${dispute.finixDisputeId}`}
            className="text-sm font-semibold text-slate-600 hover:underline"
          >
            Open Full Details
          </Link>
        </div>
      </Section>
    </div>
  );
}
