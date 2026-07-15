import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { formatCents } from "@/lib/format";
import CopyableIdBadge from "@/components/merchant/CopyableIdBadge";
import StateBadge from "@/components/merchant/StateBadge";
import { formatDateTimeCDT } from "@/lib/formatDateTimeCDT";
import { loadDepositDetail } from "@/lib/finix/depositDetail";
import { formatFundingSpeed } from "@/lib/depositColumns";
import { titleCase, Row, FlowStep } from "@/components/merchant/RefundDetailPrimitives";

export default async function DepositFullDetailPage({
  params,
}: {
  params: Promise<{ depositId: string }>;
}) {
  const session = await getSession();
  const churchId = session!.churchId!;
  const { depositId } = await params;

  const detail = await loadDepositDetail(depositId, churchId);

  if (!detail) {
    return (
      <div>
        <Link href="/merchant/deposits" className="text-sm text-blue-600 hover:underline flex items-center gap-1 mb-4">
          <ArrowLeft className="w-4 h-4" /> All Deposits
        </Link>
        <p className="text-sm text-slate-500">This deposit could not be found.</p>
      </div>
    );
  }

  const { deposit, church, settlements, payments, affectingRefunds, affectingReturns } = detail;
  const state = (deposit.state || "").toUpperCase();
  const netAmount = deposit.netAmountCents ?? deposit.amountCents ?? 0;
  const tags = (deposit.rawJsonRedacted as { tags?: Record<string, string> } | null)?.tags ?? null;

  return (
    <div>
      <Link href="/merchant/deposits" className="text-sm text-blue-600 hover:underline flex items-center gap-1 mb-4">
        <ArrowLeft className="w-4 h-4" /> All Deposits
      </Link>

      <div className="grid grid-cols-3 gap-6">
        {/* Left column */}
        <div className="col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-3">
              <span>Deposit · {formatDateTimeCDT(deposit.createdAtFinix)}</span>
              <div className="flex items-center gap-1.5">
                <CopyableIdBadge id={deposit.finixFundingTransferAttemptId} />
                {deposit.traceId && <CopyableIdBadge id={deposit.traceId} label="Trace ID" />}
              </div>
            </div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-slate-900">{formatCents(deposit.amountCents ?? 0)}</span>
                <span className="text-sm font-semibold text-slate-400">{deposit.currency || "USD"}</span>
              </div>
              <StateBadge state={state} />
            </div>
            <p className="text-sm text-slate-600">
              Organization: <span className="font-semibold text-slate-900">{church?.name || "—"}</span>
              {" · "}
              Destination:{" "}
              <span className="font-semibold text-slate-900">
                {deposit.bankName || "Bank"} ••••{deposit.bankAccountLast4 || "----"}
              </span>
            </p>
            {deposit.failureCode && (
              <p className="text-xs text-red-500 mt-1">{deposit.failureCode}: {deposit.failureMessage}</p>
            )}
          </div>

          {/* Transaction Flow */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Transaction Flow</h3>
            <div className="space-y-4">
              <FlowStep
                label="Settlement Created"
                detail={formatDateTimeCDT(settlements[0]?.createdAtFinix ?? deposit.createdAtFinix)}
                status={settlements.length > 0 ? "done" : "upcoming"}
              />
              <FlowStep label="Deposit Scheduled" detail={formatDateTimeCDT(deposit.createdAtFinix)} status="done" />
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
                label={
                  state === "FAILED" ? "Deposit Failed" :
                  state === "RETURNED" ? "Deposit Returned" :
                  state === "CANCELED" ? "Deposit Canceled" : "Deposit Completed"
                }
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
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Deposit Details</h3>
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

          {/* Included Settlements */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Included Settlements ({settlements.length})</h3>
            {settlements.length === 0 ? (
              <p className="text-sm text-slate-500">No settlements linked to this deposit.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100">
                    <th className="py-2">Settlement ID</th>
                    <th className="py-2 text-right">Gross</th>
                    <th className="py-2 text-right">Fees</th>
                    <th className="py-2 text-right">Net</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {settlements.map((s) => (
                    <tr key={s.id} className="border-b border-slate-50 last:border-0">
                      <td className="py-2"><CopyableIdBadge id={s.finixSettlementId} /></td>
                      <td className="py-2 text-right text-slate-700">{formatCents(s.totalAmountCents ?? 0)}</td>
                      <td className="py-2 text-right text-slate-700">{formatCents(s.feeAmountCents ?? 0)}</td>
                      <td className="py-2 text-right font-semibold text-slate-900">{formatCents(s.netAmountCents ?? 0)}</td>
                      <td className="py-2"><StateBadge state={s.state} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Bank Account */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Bank Account</h3>
            <Row label="Bank Name" value={deposit.bankName || "—"} />
            <Row label="Account Holder" value={deposit.accountHolderName || "—"} />
            <Row label="Masked Account Number" value={deposit.bankAccountLast4 ? `•••• ${deposit.bankAccountLast4}` : "—"} />
            <Row label="Account Type" value={deposit.bankAccountType || "—"} />
            <Row label="Last Four" value={deposit.bankAccountLast4 || "—"} />
            <Row label="Bank Account State" value={titleCase(deposit.state)} />
          </div>

          {/* Related Resources */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Related Resources</h3>
            <Row label="Organization" value={church?.name || "—"} />
            <Row label="Settlements" value={String(settlements.length)} />
            <Row label="Payments" value={String(payments.length)} />
            <Row label="Affecting Refunds" value={String(affectingRefunds.length)} />
            <Row label="Affecting Bank Returns" value={String(affectingReturns.length)} />
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
