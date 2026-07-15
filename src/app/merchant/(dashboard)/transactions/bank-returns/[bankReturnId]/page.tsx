import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { formatCents } from "@/lib/format";
import CopyableIdBadge from "@/components/merchant/CopyableIdBadge";
import StateBadge from "@/components/merchant/StateBadge";
import { formatPersonName } from "@/lib/formatPersonName";
import { formatDateTimeCDT } from "@/lib/formatDateTimeCDT";
import { loadBankReturnDetail } from "@/lib/finix/bankReturnDetail";
import { formatAchReturnReason } from "@/lib/finix/achReturnReasonCodes";
import { titleCase, Row, FlowStep } from "@/components/merchant/RefundDetailPrimitives";

export default async function BankReturnFullDetailPage({
  params,
}: {
  params: Promise<{ bankReturnId: string }>;
}) {
  const session = await getSession();
  const churchId = session!.churchId!;
  const { bankReturnId } = await params;

  const detail = await loadBankReturnDetail(bankReturnId, churchId);

  if (!detail) {
    return (
      <div>
        <Link href="/merchant/transactions/bank-returns" className="text-sm text-blue-600 hover:underline flex items-center gap-1 mb-4">
          <ArrowLeft className="w-4 h-4" /> All Bank Returns
        </Link>
        <p className="text-sm text-slate-500">This bank return could not be found.</p>
      </div>
    );
  }

  const { bankReturn, church, transfer, instrument, donor, settlement, payout } = detail;
  const state = (bankReturn.state || "").toUpperCase();

  return (
    <div>
      <Link href="/merchant/transactions/bank-returns" className="text-sm text-blue-600 hover:underline flex items-center gap-1 mb-4">
        <ArrowLeft className="w-4 h-4" /> All Bank Returns
      </Link>

      <div className="grid grid-cols-3 gap-6">
        {/* Left column */}
        <div className="col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-3">
              <span>Bank Return · {formatDateTimeCDT(bankReturn.createdAtFinix)}</span>
              <div className="flex items-center gap-1.5">
                <CopyableIdBadge id={bankReturn.bankReturnId} />
                {bankReturn.traceId && <CopyableIdBadge id={bankReturn.traceId} label="Trace ID" />}
              </div>
            </div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-slate-900">{formatCents(bankReturn.amountCents ?? 0)}</span>
                <span className="text-sm font-semibold text-slate-400">{bankReturn.currency || "USD"}</span>
              </div>
              <StateBadge state={state} />
            </div>
            <p className="text-sm text-slate-600">
              Buyer: <span className="font-semibold text-slate-900">{formatPersonName(donor?.name, instrument?.accountHolderName)}</span>
              {" · "}
              Payment Instrument:{" "}
              <span className="font-semibold text-slate-900">
                {instrument?.bankLast4 ? "Bank" : "—"} ••••{instrument?.bankLast4 || "----"}
              </span>
            </p>
          </div>

          {/* Transaction Flow */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Transaction Flow</h3>
            <div className="space-y-4">
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
              <FlowStep label={formatAchReturnReason(bankReturn.reasonCode)} status="failed" />
              <FlowStep
                label="Original Payment Updated to Returned"
                detail={formatDateTimeCDT(bankReturn.updatedAtFinix)}
                status="done"
              />
            </div>
          </div>

          {/* Bank Return Details */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Bank Return Details</h3>
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

          {/* Original Payment */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Original Payment</h3>
            {transfer ? (
              <>
                <Row label="Payment ID" value={<CopyableIdBadge id={transfer.finixTransferId} />} />
                <Row label="Amount" value={formatCents(transfer.amountCents ?? 0)} />
                <Row label="State" value={<StateBadge state={transfer.state} />} />
                <Row label="Created" value={formatDateTimeCDT(transfer.createdAtFinix)} />
              </>
            ) : (
              <p className="text-sm text-slate-500">The original payment could not be found.</p>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Buyer */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Buyer</h3>
            <Row label="Name" value={formatPersonName(donor?.name, instrument?.accountHolderName)} />
            <Row label="Email" value={donor?.email || "—"} />
            <Row label="Phone" value={donor?.phone || "—"} />
          </div>

          {/* Payment Instrument */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Payment Instrument</h3>
            <Row label="Masked Account Number" value={instrument?.bankLast4 ? `•••• ${instrument.bankLast4}` : "—"} />
            <Row label="Account Holder Name" value={instrument?.accountHolderName || "—"} />
            <Row label="Account Type" value={instrument?.bankAccountType || "—"} />
            <Row label="State" value={titleCase(instrument?.state)} />
            <Row label="Created" value={formatDateTimeCDT(instrument?.createdAtFinix)} />
          </div>

          {/* Related Resources */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Related Resources</h3>
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
              <Row label="Deposit / Payout" value={<CopyableIdBadge id={payout.finixFundingTransferAttemptId} />} />
            )}
          </div>

          {/* Tags */}
          {transfer?.tagsJson && Object.keys(transfer.tagsJson as Record<string, string>).length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <h3 className="text-sm font-bold text-slate-900 mb-4">Tags</h3>
              {Object.entries(transfer.tagsJson as Record<string, string>).map(([key, value]) => (
                <Row key={key} label={titleCase(key)} value={String(value)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
