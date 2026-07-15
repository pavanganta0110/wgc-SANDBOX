import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { formatCents } from "@/lib/format";
import CopyableIdBadge from "@/components/merchant/CopyableIdBadge";
import StateBadge from "@/components/merchant/StateBadge";
import { formatPersonName } from "@/lib/formatPersonName";
import { formatDateTimeCDT } from "@/lib/formatDateTimeCDT";
import { loadRefundDetail } from "@/lib/finix/refundDetail";
import { titleCase, Row, FlowStep } from "@/components/merchant/RefundDetailPrimitives";

export default async function RefundFullDetailPage({
  params,
}: {
  params: Promise<{ refundId: string }>;
}) {
  const session = await getSession();
  const churchId = session!.churchId!;
  const { refundId } = await params;

  const detail = await loadRefundDetail(refundId, churchId);

  if (!detail) {
    return (
      <div>
        <Link href="/merchant/transactions/refunds" className="text-sm text-blue-600 hover:underline flex items-center gap-1 mb-4">
          <ArrowLeft className="w-4 h-4" /> All Refunds
        </Link>
        <p className="text-sm text-slate-500">This refund could not be found.</p>
      </div>
    );
  }

  const { refund, church, transfer, instrument, donor, refundType, settlement } = detail;
  const state = (refund.state || "").toUpperCase();
  const tags = (refund.tagsJson as Record<string, string> | null) ?? null;

  return (
    <div>
      <Link href="/merchant/transactions/refunds" className="text-sm text-blue-600 hover:underline flex items-center gap-1 mb-4">
        <ArrowLeft className="w-4 h-4" /> All Refunds
      </Link>

      <div className="grid grid-cols-3 gap-6">
        {/* Left column */}
        <div className="col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-3">
              <span>Refund · {formatDateTimeCDT(refund.createdAtFinix)}</span>
              <div className="flex items-center gap-1.5">
                <CopyableIdBadge id={refund.finixReversalId} />
                {refund.traceId && <CopyableIdBadge id={refund.traceId} label="Trace ID" />}
              </div>
            </div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-slate-900">{formatCents(refund.amountCents ?? 0)}</span>
                <span className="text-sm font-semibold text-slate-400">{refund.currency || "USD"}</span>
              </div>
              <div className="flex items-center gap-2">
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
            </div>
            <p className="text-sm text-slate-600">
              Donor: <span className="font-semibold text-slate-900">{formatPersonName(donor?.name, instrument?.accountHolderName)}</span>
              {" · "}
              Payment Instrument:{" "}
              <span className="font-semibold text-slate-900">
                {instrument?.cardBrand || (instrument?.bankLast4 ? "Bank" : "")}{" "}
                ••••{instrument?.cardLast4 || instrument?.bankLast4 || "----"}
              </span>
            </p>
          </div>

          {/* Transaction Flow */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Transaction Flow</h3>
            <div className="space-y-4">
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
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Refund Details</h3>
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

          {/* Receipt */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Receipt</h3>
            <p className="text-sm text-slate-500">
              Receipts for a refunded gift are managed from the original payment.
            </p>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Donor */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Donor</h3>
            <Row label="Name" value={formatPersonName(donor?.name, instrument?.accountHolderName)} />
            <Row label="Email" value={donor?.email || "—"} />
            <Row label="Phone" value={donor?.phone || "—"} />
          </div>

          {/* Payment Instrument */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Payment Instrument</h3>
            <Row label="Brand" value={instrument?.cardBrand || (instrument?.bankLast4 ? "Bank Account" : "—")} />
            <Row
              label="Masked Number"
              value={instrument ? `•••• ${instrument.cardLast4 || instrument.bankLast4 || "----"}` : "—"}
            />
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

          {/* Related Resources */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Related Resources</h3>
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

          {/* Tags */}
          {tags && Object.keys(tags).length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <h3 className="text-sm font-bold text-slate-900 mb-4">Tags</h3>
              {Object.entries(tags).map(([key, value]) => (
                <Row key={key} label={titleCase(key)} value={String(value)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
