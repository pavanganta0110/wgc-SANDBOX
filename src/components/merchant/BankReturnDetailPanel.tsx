import { formatCents } from "@/lib/format";
import CopyableIdBadge from "@/components/merchant/CopyableIdBadge";
import ClosePanelButton from "@/components/merchant/ClosePanelButton";
import ViewAllDetailsLink from "@/components/merchant/ViewAllDetailsLink";
import { PinButton, PaymentMoreMenu } from "@/components/merchant/PaymentDetailActions";
import StateBadge from "@/components/merchant/StateBadge";
import { formatPersonName } from "@/lib/formatPersonName";
import { formatDateTimeCDT } from "@/lib/formatDateTimeCDT";
import { loadBankReturnDetail } from "@/lib/finix/bankReturnDetail";
import { formatAchReturnReason } from "@/lib/finix/achReturnReasonCodes";
import { titleCase, Row, FlowStep } from "@/components/merchant/RefundDetailPrimitives";

export default async function BankReturnDetailPanel({
  bankReturnId,
  churchId,
}: {
  bankReturnId: string;
  churchId: string;
}) {
  const detail = await loadBankReturnDetail(bankReturnId, churchId);

  if (!detail) {
    return (
      <div className="w-full lg:w-[420px] shrink-0 bg-white border border-slate-100 rounded-2xl shadow-sm p-6">
        <p className="text-sm text-slate-500">Bank return not found.</p>
      </div>
    );
  }

  const { bankReturn, church, transfer, instrument, donor, settlement, payout } = detail;
  const state = (bankReturn.state || "").toUpperCase();

  return (
    <div className="w-full lg:w-[420px] shrink-0 bg-white border border-slate-100 rounded-2xl shadow-sm h-fit lg:sticky lg:top-6">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Bank Return</h3>
          <p className="text-xs text-slate-400 mt-0.5">{formatDateTimeCDT(bankReturn.createdAtFinix)}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <CopyableIdBadge id={bankReturn.bankReturnId} />
          {bankReturn.traceId && <CopyableIdBadge id={bankReturn.traceId} label="Trace ID" />}
          <PinButton />
          <PaymentMoreMenu />
          <ViewAllDetailsLink href={`/merchant/transactions/bank-returns/${bankReturn.bankReturnId}`} />
          <ClosePanelButton />
        </div>
      </div>

      {/* Summary */}
      <div className="px-5 py-4 border-b border-slate-100">
        <p className="text-2xl font-bold text-slate-900">{formatCents(bankReturn.amountCents ?? 0)}</p>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <StateBadge state={state} />
        </div>
        <p className="text-sm text-slate-600 mt-2">
          Buyer: <span className="font-semibold text-slate-900">{formatPersonName(donor?.name, instrument?.accountHolderName)}</span>
          {" · "}
          Instrument:{" "}
          <span className="font-semibold text-slate-900">
            {instrument?.bankLast4 ? "Bank" : "—"} ••••{instrument?.bankLast4 || "----"}
          </span>
        </p>
      </div>

      {/* Transaction Flow */}
      <div className="px-5 py-4 border-b border-slate-100">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Transaction Flow</h4>
        <div className="space-y-3">
          <FlowStep
            label="ACH Payment Created"
            detail={formatDateTimeCDT(transfer?.createdAtFinix)}
            status={transfer ? "done" : "upcoming"}
          />
          <FlowStep
            label={(transfer?.state || "").toUpperCase() === "SUCCEEDED" ? "ACH Payment Succeeded" : "ACH Payment Pending"}
            detail={formatDateTimeCDT(transfer?.updatedAtFinix)}
            status={(transfer?.state || "").toUpperCase() === "SUCCEEDED" ? "done" : "pending"}
          />
          <FlowStep
            label="Bank Return Received"
            detail={formatDateTimeCDT(bankReturn.createdAtFinix)}
            status="failed"
          />
          <FlowStep
            label={formatAchReturnReason(bankReturn.reasonCode)}
            status="failed"
          />
          <FlowStep
            label="Original Payment Updated to Returned"
            detail={formatDateTimeCDT(bankReturn.updatedAtFinix)}
            status="done"
          />
        </div>
      </div>

      {/* Bank Return Details */}
      <div className="px-5 py-4 border-b border-slate-100">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Bank Return Details</h4>
        <div className="space-y-0.5">
          <Row label="Return Code" value={bankReturn.reasonCode || "—"} />
          <Row label="Return Description" value={bankReturn.reasonDescription || "—"} />
          <Row label="Returned Amount" value={formatCents(bankReturn.amountCents ?? 0)} />
          <Row label="Original Payment Amount" value={formatCents(transfer?.amountCents ?? 0)} />
          <Row
            label="Original Payment ID"
            value={bankReturn.originalTransferId ? <CopyableIdBadge id={bankReturn.originalTransferId} /> : "—"}
          />
          <Row label="Return ID" value={<CopyableIdBadge id={bankReturn.bankReturnId} />} />
          <Row label="Effective Date" value={formatDateTimeCDT(bankReturn.effectiveAt)} />
          <Row label="Created" value={formatDateTimeCDT(bankReturn.createdAtFinix)} />
          <Row label="Updated" value={formatDateTimeCDT(bankReturn.updatedAtFinix)} />
        </div>
      </div>

      {/* Buyer */}
      <div className="px-5 py-4 border-b border-slate-100">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Buyer</h4>
        <div className="space-y-0.5">
          <Row label="Name" value={formatPersonName(donor?.name, instrument?.accountHolderName)} />
          <Row label="Email" value={donor?.email || "—"} />
          <Row label="Phone" value={donor?.phone || "—"} />
        </div>
      </div>

      {/* Payment Instrument */}
      <div className="px-5 py-4 border-b border-slate-100">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Payment Instrument</h4>
        <div className="space-y-0.5">
          <Row label="Masked Account Number" value={instrument?.bankLast4 ? `•••• ${instrument.bankLast4}` : "—"} />
          <Row label="Account Holder Name" value={instrument?.accountHolderName || "—"} />
          <Row label="Account Type" value={instrument?.bankAccountType || "—"} />
          <Row label="State" value={titleCase(instrument?.state)} />
          <Row label="Created" value={formatDateTimeCDT(instrument?.createdAtFinix)} />
        </div>
      </div>

      {/* Related Resources */}
      <div className="px-5 py-4 border-b border-slate-100">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Related Resources</h4>
        <div className="space-y-0.5">
          <Row label="Organization" value={church?.name || "—"} />
          <Row
            label="Original ACH Payment"
            value={
              bankReturn.originalTransferId ? (
                <a
                  href={`/merchant/transactions/payments?id=${bankReturn.originalTransferId}`}
                  className="text-blue-600 hover:underline font-mono text-xs"
                >
                  {bankReturn.originalTransferId.slice(0, 12)}…
                </a>
              ) : (
                "—"
              )
            }
          />
          {settlement && <Row label="Settlement" value={<CopyableIdBadge id={settlement.finixSettlementId} />} />}
          {payout && (
            <Row
              label="Deposit / Payout"
              value={<CopyableIdBadge id={payout.finixFundingTransferAttemptId} />}
            />
          )}
        </div>
      </div>
    </div>
  );
}
