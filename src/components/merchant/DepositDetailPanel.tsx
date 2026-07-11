import { formatCents } from "@/lib/format";
import CopyableIdBadge from "@/components/merchant/CopyableIdBadge";
import ClosePanelButton from "@/components/merchant/ClosePanelButton";
import ViewAllDetailsLink from "@/components/merchant/ViewAllDetailsLink";
import { PinButton, PaymentMoreMenu } from "@/components/merchant/PaymentDetailActions";
import StateBadge from "@/components/merchant/StateBadge";
import { formatDateTimeCDT } from "@/lib/formatDateTimeCDT";
import { loadDepositDetail } from "@/lib/finix/depositDetail";
import { formatFundingSpeed } from "@/lib/depositColumns";
import { titleCase, Row, FlowStep } from "@/components/merchant/RefundDetailPrimitives";

export default async function DepositDetailPanel({
  depositId,
  churchId,
}: {
  depositId: string;
  churchId: string;
}) {
  const detail = await loadDepositDetail(depositId, churchId);

  if (!detail) {
    return (
      <div className="w-full lg:w-[420px] shrink-0 bg-white border border-slate-100 rounded-2xl shadow-sm p-6">
        <p className="text-sm text-slate-500">Deposit not found.</p>
      </div>
    );
  }

  const { deposit, church, settlements, payments, affectingRefunds, affectingReturns } = detail;
  const state = (deposit.state || "").toUpperCase();
  const netAmount = deposit.netAmountCents ?? deposit.amountCents ?? 0;

  return (
    <div className="w-full lg:w-[420px] shrink-0 bg-white border border-slate-100 rounded-2xl shadow-sm h-fit lg:sticky lg:top-6">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Deposit</h3>
          <p className="text-xs text-slate-400 mt-0.5">{formatDateTimeCDT(deposit.createdAtFinix)}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <CopyableIdBadge id={deposit.finixFundingTransferAttemptId} />
          {deposit.traceId && <CopyableIdBadge id={deposit.traceId} label="Trace ID" />}
          <PinButton />
          <PaymentMoreMenu />
          <ViewAllDetailsLink href={`/merchant/deposits/${deposit.finixFundingTransferAttemptId}`} />
          <ClosePanelButton />
        </div>
      </div>

      {/* Summary */}
      <div className="px-5 py-4 border-b border-slate-100">
        <p className="text-2xl font-bold text-slate-900">{formatCents(deposit.amountCents ?? 0)}</p>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <StateBadge state={state} />
        </div>
        <p className="text-sm text-slate-600 mt-2">
          Organization: <span className="font-semibold text-slate-900">{church?.name || "—"}</span>
          {" · "}
          Destination: <span className="font-semibold text-slate-900">
            {deposit.bankName || "Bank"} ••••{deposit.bankAccountLast4 || "----"}
          </span>
        </p>
        {deposit.failureCode && (
          <p className="text-xs text-red-500 mt-1">{deposit.failureCode}: {deposit.failureMessage}</p>
        )}
      </div>

      {/* Transaction Flow */}
      <div className="px-5 py-4 border-b border-slate-100">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Transaction Flow</h4>
        <div className="space-y-3">
          <FlowStep
            label="Settlement Created"
            detail={formatDateTimeCDT(settlements[0]?.createdAtFinix ?? deposit.createdAtFinix)}
            status={settlements.length > 0 ? "done" : "upcoming"}
          />
          <FlowStep
            label="Deposit Scheduled"
            detail={formatDateTimeCDT(deposit.createdAtFinix)}
            status="done"
          />
          <FlowStep
            label="Deposit Processing"
            detail={state === "PROCESSING" ? "In progress" : undefined}
            status={["PROCESSING", "SENT", "COMPLETED"].includes(state) ? "done" : state === "PENDING" ? "pending" : "upcoming"}
          />
          <FlowStep
            label="Deposit Sent"
            detail={formatDateTimeCDT(deposit.sentAt)}
            status={["SENT", "COMPLETED"].includes(state) || deposit.sentAt ? "done" : "upcoming"}
          />
          <FlowStep
            label={state === "FAILED" ? "Deposit Failed" : state === "RETURNED" ? "Deposit Returned" : state === "CANCELED" ? "Deposit Canceled" : "Deposit Completed"}
            detail={formatDateTimeCDT(deposit.arrivedAt)}
            status={
              state === "FAILED" || state === "RETURNED" ? "failed" :
              state === "COMPLETED" || deposit.arrivedAt ? "done" :
              state === "CANCELED" ? "failed" : "upcoming"
            }
          />
        </div>
      </div>

      {/* Deposit Details */}
      <div className="px-5 py-4 border-b border-slate-100">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Deposit Details</h4>
        <div className="space-y-0.5">
          <Row label="Deposit ID" value={<CopyableIdBadge id={deposit.finixFundingTransferAttemptId} />} />
          <Row label="Organization" value={church?.name || "—"} />
          <Row label="Deposit Amount" value={formatCents(deposit.amountCents ?? 0)} />
          <Row label="Net Amount" value={formatCents(netAmount)} />
          <Row label="Deposit State" value={state} />
          <Row label="Funding Speed" value={formatFundingSpeed(deposit.fundingSpeed)} />
          <Row label="Settlement Count" value={String(deposit.settlementCount ?? settlements.length)} />
          <Row label="Payment Count" value={String(deposit.paymentCount ?? payments.length)} />
          <Row label="Created" value={formatDateTimeCDT(deposit.createdAtFinix)} />
          <Row label="Updated" value={formatDateTimeCDT(deposit.updatedAtFinix)} />
          <Row label="Expected Deposit Date" value={formatDateTimeCDT(deposit.estimatedArrivalDate)} />
          <Row label="Actual Deposit Date" value={formatDateTimeCDT(deposit.arrivedAt)} />
          {deposit.traceId && <Row label="Trace / Reference" value={deposit.traceId} />}
        </div>
      </div>

      {/* Destination Bank */}
      <div className="px-5 py-4 border-b border-slate-100">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Destination Bank</h4>
        <div className="space-y-0.5">
          <Row label="Bank Name" value={deposit.bankName || "—"} />
          <Row label="Account Holder" value={deposit.accountHolderName || "—"} />
          <Row label="Masked Account Number" value={deposit.bankAccountLast4 ? `•••• ${deposit.bankAccountLast4}` : "—"} />
          <Row label="Account Type" value={deposit.bankAccountType || "—"} />
          <Row label="Last Four" value={deposit.bankAccountLast4 || "—"} />
          <Row label="Bank Account State" value={titleCase(deposit.state)} />
        </div>
      </div>

      {/* Included Settlements */}
      {settlements.length > 0 && (
        <div className="px-5 py-4 border-b border-slate-100">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Included Settlements ({settlements.length})</h4>
          <div className="space-y-2">
            {settlements.map((s) => (
              <div key={s.id} className="rounded-lg border border-slate-100 p-2.5 text-xs">
                <div className="flex items-center justify-between mb-1">
                  <CopyableIdBadge id={s.finixSettlementId} />
                  <StateBadge state={s.state} />
                </div>
                <div className="flex items-center justify-between text-slate-500">
                  <span>Gross {formatCents(s.totalAmountCents ?? 0)}</span>
                  <span>Fees {formatCents(s.feeAmountCents ?? 0)}</span>
                  <span className="font-semibold text-slate-700">Net {formatCents(s.netAmountCents ?? 0)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Related Resources */}
      <div className="px-5 py-4 border-b border-slate-100">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Related Resources</h4>
        <div className="space-y-0.5">
          <Row label="Organization" value={church?.name || "—"} />
          <Row label="Settlements" value={String(settlements.length)} />
          <Row label="Payments" value={String(payments.length)} />
          <Row label="Affecting Refunds" value={String(affectingRefunds.length)} />
          <Row label="Affecting Bank Returns" value={String(affectingReturns.length)} />
        </div>
      </div>
    </div>
  );
}
