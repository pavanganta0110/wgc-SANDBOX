import { formatCents, formatSignedCents } from "@/lib/format";
import CopyableIdBadge from "@/components/merchant/CopyableIdBadge";
import StateBadge from "@/components/merchant/StateBadge";
import ClosePanelButton from "@/components/merchant/ClosePanelButton";
import { PanelNavArrows, ViewAllDetailsButton, PaymentMoreMenu, PinButton } from "@/components/merchant/PaymentDetailActions";
import { Section, Row } from "@/components/merchant/detail/DetailDrawerPrimitives";
import { formatDateTimeCDT as formatDateTime } from "@/lib/formatDateTimeCDT";
import { loadSettlementDetail } from "@/lib/finix/settlementDetail";
import { resolveSettlementDisplayStatus, getSettlementStatusLabel } from "@/lib/finix/settlementStatus";
import { resolveMerchantDepositMessage } from "@/lib/finix/merchantDepositMessage";

export default async function SettlementDetailPanel({
  settlementId,
  churchId,
}: {
  settlementId: string;
  churchId: string;
}) {
  const detail = await loadSettlementDetail(settlementId, churchId);

  if (!detail) {
    return (
      <div className="w-full lg:w-[420px] shrink-0 border-l border-slate-100 bg-white rounded-2xl lg:rounded-none p-6">
        <p className="text-sm text-slate-500">This settlement could not be found.</p>
      </div>
    );
  }

  const { settlement, paymentRows, refunds, bankReturns, disputes, deposit, depositBankAccount, hasFundingTransferData } = detail;
  const displayStatus = resolveSettlementDisplayStatus(settlement);
  const depositMessage = resolveMerchantDepositMessage(deposit?.state, hasFundingTransferData);
  const depositBankLast4 = depositBankAccount?.last4 || deposit?.bankAccountLast4 || null;

  return (
    <div className="w-full lg:w-[420px] shrink-0 bg-white border border-slate-100 rounded-2xl shadow-sm h-fit lg:sticky lg:top-6">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <PanelNavArrows />
        <ViewAllDetailsButton href={`/merchant/settlements/${settlement.finixSettlementId}`} />
        <ClosePanelButton />
      </div>

      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
          <span>Settlement · {formatDateTime(settlement.createdAtFinix)}</span>
          <div className="flex items-center gap-1.5">
            <CopyableIdBadge id={settlement.finixSettlementId} />
            <PinButton />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">
              {formatCents(settlement.totalAmountCents ?? 0)}
            </span>
            <span className="text-sm font-semibold text-slate-400">{settlement.currency || "USD"}</span>
          </div>
          <StateBadge state={displayStatus} />
        </div>
        <PaymentMoreMenu />
      </div>

      <Section title="Settlement Details">
        <Row label="Status" value={getSettlementStatusLabel(displayStatus)} />
        <Row label="Gross Amount" value={formatCents(settlement.totalAmountCents ?? 0)} />
        <Row label="Fee Amount" value={formatSignedCents(-(settlement.feeAmountCents ?? 0))} />
        <Row label="Refund Amount" value={formatSignedCents(-(settlement.refundAmountCents ?? 0))} />
        <Row label="Return Amount" value={formatSignedCents(-(settlement.returnAmountCents ?? 0))} />
        <Row label="Dispute Amount" value={formatSignedCents(-(settlement.disputeAmountCents ?? 0))} />
        {settlement.otherAdjustmentAmountCents != null && (
          <Row label="Other Adjustments" value={formatSignedCents(settlement.otherAdjustmentAmountCents)} />
        )}
        <Row label="Net Amount" value={formatCents(settlement.netAmountCents ?? 0)} />
        <Row label="Accrued" value={formatDateTime(settlement.accruedAt)} />
        <Row label="Settled" value={formatDateTime(settlement.settledAt)} />
      </Section>

      <Section title={`Included Payments (${paymentRows.length})`}>
        {paymentRows.length === 0 ? (
          <p className="text-sm text-slate-500">No payments linked yet.</p>
        ) : (
          <div className="space-y-2">
            {paymentRows.slice(0, 10).map(({ payment }) => (
              <div key={payment.id} className="flex items-center justify-between text-sm">
                <CopyableIdBadge id={payment.finixTransferId || payment.id} label={payment.finixTransferId || payment.id} variant="link" />
                <p className="font-semibold text-slate-700">{formatCents(payment.amountCents ?? 0)}</p>
              </div>
            ))}
            {paymentRows.length > 10 && (
              <p className="text-xs text-slate-400 pt-1">+{paymentRows.length - 10} more — view full details</p>
            )}
          </div>
        )}
      </Section>

      <Section title={`Refunds (${refunds.length})`}>
        {refunds.length === 0 ? (
          <p className="text-sm text-slate-500">No refunds linked yet.</p>
        ) : (
          <div className="space-y-2">
            {refunds.slice(0, 10).map((r) => (
              <div key={r.id} className="flex items-center justify-between text-sm">
                <CopyableIdBadge id={r.finixReversalId} label={r.finixReversalId} variant="link" />
                <span className="font-semibold text-slate-700">{formatCents(r.amountCents ?? 0)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title={`Bank Returns (${bankReturns.length})`}>
        {bankReturns.length === 0 ? (
          <p className="text-sm text-slate-500">No bank returns linked yet.</p>
        ) : (
          <div className="space-y-2">
            {bankReturns.slice(0, 10).map((r) => (
              <div key={r.id} className="flex items-center justify-between text-sm">
                <CopyableIdBadge id={r.bankReturnId} label={r.bankReturnId} variant="link" />
                <span className="font-semibold text-slate-700">{formatCents(r.amountCents ?? 0)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title={`Disputes (${disputes.length})`}>
        {disputes.length === 0 ? (
          <p className="text-sm text-slate-500">No disputes linked yet.</p>
        ) : (
          <div className="space-y-2">
            {disputes.slice(0, 10).map((d) => (
              <div key={d.id} className="flex items-center justify-between text-sm">
                <CopyableIdBadge id={d.finixDisputeId} label={d.finixDisputeId} variant="link" />
                <span className="font-semibold text-slate-700">{formatCents(d.amountCents ?? 0)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Linked Deposit" last>
        {!deposit ? (
          <p className="text-sm text-slate-500">{depositMessage}</p>
        ) : (
          <div className="flex items-center justify-between text-sm">
            <div>
              <p className="font-semibold text-slate-700">
                {depositBankLast4 ? `•••• ${depositBankLast4}` : "Bank Deposit"}
              </p>
              <p className="text-xs text-slate-400">{formatDateTime(deposit.sentAt ?? deposit.createdAtFinix)}</p>
            </div>
            <div className="text-right">
              <StateBadge state={deposit.state} />
              <p className="font-semibold text-slate-900 mt-0.5">{formatCents(deposit.amountCents ?? 0)}</p>
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}
