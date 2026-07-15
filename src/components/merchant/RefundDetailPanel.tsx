import { formatCents } from "@/lib/format";
import CopyableIdBadge from "@/components/merchant/CopyableIdBadge";
import ClosePanelButton from "@/components/merchant/ClosePanelButton";
import ViewAllDetailsLink from "@/components/merchant/ViewAllDetailsLink";
import { PinButton, PaymentMoreMenu } from "@/components/merchant/PaymentDetailActions";
import StateBadge from "@/components/merchant/StateBadge";
import { formatPersonName } from "@/lib/formatPersonName";
import { formatDateTimeCDT } from "@/lib/formatDateTimeCDT";
import { loadRefundDetail } from "@/lib/finix/refundDetail";
import { titleCase, Row, FlowStep } from "@/components/merchant/RefundDetailPrimitives";

export default async function RefundDetailPanel({
  refundId,
  churchId,
}: {
  refundId: string;
  churchId: string;
}) {
  const detail = await loadRefundDetail(refundId, churchId);

  if (!detail) {
    return (
      <div className="w-full lg:w-[420px] shrink-0 bg-white border border-slate-100 rounded-2xl shadow-sm p-6">
        <p className="text-sm text-slate-500">Refund not found.</p>
      </div>
    );
  }

  const { refund, church, transfer, instrument, donor, refundType, settlement } = detail;
  const state = (refund.state || "").toUpperCase();
  const tags = (refund.tagsJson as Record<string, string> | null) ?? null;

  return (
    <div className="w-full lg:w-[420px] shrink-0 bg-white border border-slate-100 rounded-2xl shadow-sm h-fit lg:sticky lg:top-6">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Refund</h3>
          <p className="text-xs text-slate-400 mt-0.5">{formatDateTimeCDT(refund.createdAtFinix)}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <CopyableIdBadge id={refund.finixReversalId} />
          {refund.traceId && <CopyableIdBadge id={refund.traceId} label="Trace ID" />}
          <PinButton />
          <PaymentMoreMenu />
          <ViewAllDetailsLink href={`/merchant/transactions/refunds/${refund.finixReversalId}`} />
          <ClosePanelButton />
        </div>
      </div>

      {/* Summary */}
      <div className="px-5 py-4 border-b border-slate-100">
        <p className="text-2xl font-bold text-slate-900">{formatCents(refund.amountCents ?? 0)}</p>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <StateBadge state={state} />
          {refundType === "FULL" && (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
              Full Refund
            </span>
          )}
          {refundType === "PARTIAL" && (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
              Partial Refund
            </span>
          )}
        </div>
        {refund.failureCode && (
          <p className="text-xs text-red-500 mt-1">{refund.failureCode}: {refund.failureMessage}</p>
        )}
        <p className="text-sm text-slate-600 mt-2">
          Donor: <span className="font-semibold text-slate-900">{formatPersonName(donor?.name, instrument?.accountHolderName)}</span>
          {" · "}
          Instrument:{" "}
          <span className="font-semibold text-slate-900">
            {instrument?.cardBrand || (instrument?.bankLast4 ? "Bank" : "—")}{" "}
            ••••{instrument?.cardLast4 || instrument?.bankLast4 || "----"}
          </span>
        </p>
      </div>

      {/* Transaction Flow */}
      <div className="px-5 py-4 border-b border-slate-100">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Transaction Flow</h4>
        <div className="space-y-3">
          <FlowStep
            label="Original Payment Succeeded"
            detail={formatDateTimeCDT(transfer?.createdAtFinix)}
            status={(transfer?.state || "").toUpperCase() === "SUCCEEDED" ? "done" : "upcoming"}
          />
          <FlowStep label="Refund Created" detail={formatDateTimeCDT(refund.createdAtFinix)} status="done" />
          {state === "PENDING" && <FlowStep label="Refund Pending" status="pending" />}
          {state === "SUCCEEDED" && (
            <FlowStep label="Refund Succeeded" detail={formatDateTimeCDT(refund.updatedAtFinix)} status="done" />
          )}
          {state === "FAILED" && (
            <FlowStep label="Refund Failed" detail={refund.failureMessage ?? undefined} status="failed" />
          )}
        </div>
      </div>

      {/* Refund Details */}
      <div className="px-5 py-4 border-b border-slate-100">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Refund Details</h4>
        <div className="space-y-0.5">
          <Row label="Refund Amount" value={formatCents(refund.amountCents ?? 0)} />
          <Row label="Original Amount" value={formatCents(transfer?.amountCents ?? 0)} />
          <Row label="Refund Type" value={refundType ? titleCase(refundType) : "—"} />
          <Row
            label="Original Payment ID"
            value={refund.finixOriginalTransferId ? <CopyableIdBadge id={refund.finixOriginalTransferId} /> : "—"}
          />
          <Row label="Refund ID" value={<CopyableIdBadge id={refund.finixReversalId} />} />
          <Row label="Reason" value={refund.reason || "—"} />
          {refund.failureCode && (
            <Row label="Failure" value={`${refund.failureCode}: ${refund.failureMessage ?? ""}`} />
          )}
          <Row label="Created" value={formatDateTimeCDT(refund.createdAtFinix)} />
          <Row label="Updated" value={formatDateTimeCDT(refund.updatedAtFinix)} />
        </div>
      </div>

      {/* Donor */}
      <div className="px-5 py-4 border-b border-slate-100">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Donor</h4>
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
          <Row label="Brand" value={instrument?.cardBrand || (instrument?.bankLast4 ? "Bank Account" : "—")} />
          <Row label="Masked Number" value={instrument ? `•••• ${instrument.cardLast4 || instrument.bankLast4 || "----"}` : "—"} />
          <Row label="Holder Name" value={instrument?.accountHolderName || "—"} />
          {instrument?.cardExpirationMonth && instrument?.cardExpirationYear && (
            <Row label="Expiration" value={`${instrument.cardExpirationMonth}/${instrument.cardExpirationYear}`} />
          )}
          <Row label="State" value={titleCase(instrument?.state)} />
          <Row label="Type" value={instrument?.bankLast4 ? "Bank Account" : instrument ? "Card" : "—"} />
          <Row label="Address" value={instrument?.addressCountry || "—"} />
          <Row label="CVV Verification" value={titleCase(instrument?.securityCodeVerification)} />
          <Row label="Address Verification" value={titleCase(instrument?.addressVerification)} />
        </div>
      </div>

      {/* Related Resources */}
      <div className="px-5 py-4 border-b border-slate-100">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Related Resources</h4>
        <div className="space-y-0.5">
          <Row label="Organization" value={church?.name || "—"} />
          <Row
            label="Original Payment"
            value={
              refund.finixOriginalTransferId ? (
                <a
                  href={`/merchant/transactions/payments?id=${refund.finixOriginalTransferId}`}
                  className="text-blue-600 hover:underline font-mono text-xs"
                >
                  {refund.finixOriginalTransferId.slice(0, 12)}…
                </a>
              ) : (
                "—"
              )
            }
          />
          {settlement && (
            <Row label="Settlement" value={<CopyableIdBadge id={settlement.finixSettlementId} />} />
          )}
        </div>
      </div>

      {/* Receipt */}
      <div className="px-5 py-4 border-b border-slate-100">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Receipt</h4>
        <p className="text-sm text-slate-500">
          Receipts for a refunded gift are managed from the original payment.
        </p>
      </div>

      {/* Tags */}
      {tags && Object.keys(tags).length > 0 && (
        <div className="px-5 py-4">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Tags</h4>
          <div className="space-y-0.5">
            {Object.entries(tags).map(([key, value]) => (
              <Row key={key} label={titleCase(key)} value={String(value)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
