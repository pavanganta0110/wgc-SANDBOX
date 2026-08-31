import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAdminSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { formatCents, formatSignedCents } from "@/lib/format";
import CopyableIdBadge from "@/components/merchant/CopyableIdBadge";
import StateBadge from "@/components/merchant/StateBadge";
import { formatPersonName } from "@/lib/formatPersonName";
import { formatDateTimeCDT as formatDateTime } from "@/lib/formatDateTimeCDT";
import { titleCaseFromSnake as titleCase } from "@/lib/finix/displayFormatters";
import { mapFeeType } from "@/lib/fees/feeTypeLabels";
import { loadSettlementDetail } from "@/lib/finix/settlementDetail";
import { resolveSettlementDisplayStatus, getSettlementStatusLabel } from "@/lib/finix/settlementStatus";
import { resolveMerchantDepositMessage } from "@/lib/finix/merchantDepositMessage";

// Admin read-only mirror of the merchant's own full Settlement detail page
// (src/app/merchant/(dashboard)/settlements/[settlementId]/page.tsx) — same
// shared loadSettlementDetail loader, so what admin sees here matches
// exactly what the merchant sees. Reconciliation management and audit
// history are left off: this is a support view ("financial actions...
// disabled", per the merchant layout banner), not a place admin should be
// changing reconciliation state.
export default async function AdminSettlementDetailPage({
  params,
}: {
  params: Promise<{ churchId: string; settlementId: string }>;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const { churchId, settlementId } = await params;
  const detail = await loadSettlementDetail(settlementId, churchId);

  if (!detail) {
    return (
      <div>
        <Link
          href={`/admin/merchants/${churchId}/settlements`}
          className="text-sm text-blue-600 hover:underline flex items-center gap-1 mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> All Settlements
        </Link>
        <p className="text-sm text-slate-500">This settlement could not be found.</p>
      </div>
    );
  }

  const { settlement, paymentRows, refunds, bankReturns, disputes, fees, deposit, depositBankAccount, hasFundingTransferData } = detail;
  const displayStatus = resolveSettlementDisplayStatus(settlement);
  const depositMessage = resolveMerchantDepositMessage(deposit?.state, hasFundingTransferData);
  const depositBankLast4 = depositBankAccount?.last4 || deposit?.bankAccountLast4 || null;
  const depositBankName = depositBankAccount?.bankName || deposit?.bankName || null;
  const depositAccountType = depositBankAccount?.accountType || deposit?.bankAccountType || null;

  const feeTotalsByType = new Map<string, number>();
  for (const fee of fees) {
    const type = fee.feeType || "OTHER";
    feeTotalsByType.set(type, (feeTotalsByType.get(type) ?? 0) + (fee.amountCents ?? 0));
  }

  return (
    <div>
      <Link
        href={`/admin/merchants/${churchId}/settlements`}
        className="text-sm text-blue-600 hover:underline flex items-center gap-1 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> All Settlements
      </Link>

      <div className="max-w-4xl space-y-6">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-3">
            <span>Settlement · {formatDateTime(settlement.createdAtFinix)}</span>
            <CopyableIdBadge id={settlement.finixSettlementId} />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900">{formatCents(settlement.totalAmountCents ?? 0)}</span>
              <span className="text-sm font-semibold text-slate-400">{settlement.currency || "USD"}</span>
            </div>
            <StateBadge state={displayStatus} label={getSettlementStatusLabel(displayStatus)} />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h3 className="text-sm font-bold text-slate-900 mb-4">Settlement Details</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
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
            <Row label="Transaction Count" value={String(settlement.transactionCount ?? 0)} />
            <Row label="Accrued" value={formatDateTime(settlement.accruedAt)} />
            <Row label="Settled" value={formatDateTime(settlement.settledAt)} />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h3 className="text-sm font-bold text-slate-900 mb-4">Included Payments ({paymentRows.length})</h3>
          {paymentRows.length === 0 ? (
            <p className="text-sm text-slate-500">No payments linked yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    <th className="py-2 pr-4">Payment ID</th>
                    <th className="py-2 pr-4">Donor</th>
                    <th className="py-2 pr-4 text-right">Gross</th>
                    <th className="py-2 pr-4">State</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentRows.map(({ payment, donor, instrument, transfer }) => (
                    <tr key={payment.id} className="border-t border-slate-50">
                      <td className="py-2 pr-4">
                        {payment.finixTransferId ? (
                          <Link
                            href={`/admin/merchants/${churchId}/transactions/${payment.finixTransferId}`}
                            className="text-blue-600 hover:underline"
                          >
                            {payment.finixTransferId}
                          </Link>
                        ) : (
                          payment.id
                        )}
                      </td>
                      <td className="py-2 pr-4 text-slate-700">{formatPersonName(donor?.name, instrument?.accountHolderName)}</td>
                      <td className="py-2 pr-4 text-right text-slate-900 font-semibold">{formatCents(payment.amountCents ?? 0)}</td>
                      <td className="py-2 pr-4"><StateBadge state={transfer?.state || payment.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h3 className="text-sm font-bold text-slate-900 mb-4">Fee Breakdown</h3>
          {feeTotalsByType.size === 0 ? (
            <p className="text-sm text-slate-500 mb-4">No fees linked yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 text-sm mb-4">
              {[...feeTotalsByType.entries()].map(([type, total]) => (
                <Row key={type} label={mapFeeType(type).label} value={formatCents(total)} />
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h3 className="text-sm font-bold text-slate-900 mb-4">Refunds ({refunds.length})</h3>
          {refunds.length === 0 ? (
            <p className="text-sm text-slate-500">No refunds linked yet.</p>
          ) : (
            <div className="space-y-2">
              {refunds.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-sm py-1 border-b border-slate-50 last:border-0">
                  <CopyableIdBadge id={r.finixReversalId} />
                  <span className="text-slate-500">{r.reason ? titleCase(r.reason) : ""}</span>
                  <span className="font-semibold text-slate-700">{formatCents(r.amountCents ?? 0)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h3 className="text-sm font-bold text-slate-900 mb-4">Bank Returns ({bankReturns.length})</h3>
          {bankReturns.length === 0 ? (
            <p className="text-sm text-slate-500">No bank returns linked yet.</p>
          ) : (
            <div className="space-y-2">
              {bankReturns.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-sm py-1 border-b border-slate-50 last:border-0">
                  <CopyableIdBadge id={r.bankReturnId} />
                  <span className="text-slate-500">{r.reasonDescription || titleCase(r.reasonCode)}</span>
                  <span className="font-semibold text-slate-700">{formatCents(r.amountCents ?? 0)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h3 className="text-sm font-bold text-slate-900 mb-4">Dispute Adjustments ({disputes.length})</h3>
          {disputes.length === 0 ? (
            <p className="text-sm text-slate-500">No disputes linked yet.</p>
          ) : (
            <div className="space-y-2">
              {disputes.map((d) => (
                <div key={d.id} className="flex items-center justify-between text-sm py-1 border-b border-slate-50 last:border-0">
                  <CopyableIdBadge id={d.finixDisputeId} />
                  <span className="text-slate-500">{titleCase(d.reason)}</span>
                  <span className="font-semibold text-slate-700">{formatCents(d.amountCents ?? 0)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h3 className="text-sm font-bold text-slate-900 mb-4">Linked Deposit</h3>
          {!deposit ? (
            <p className="text-sm text-slate-500">{depositMessage}</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <Row label="Deposit ID" value={<CopyableIdBadge id={deposit.finixFundingTransferAttemptId} />} />
              <Row label="State" value={titleCase(deposit.state)} />
              <Row label="Amount" value={formatCents(deposit.amountCents ?? 0)} />
              {depositBankName && <Row label="Bank Name" value={depositBankName} />}
              {depositAccountType && <Row label="Account Type" value={titleCase(depositAccountType)} />}
              <Row label="Bank Account" value={depositBankLast4 ? `•••• ${depositBankLast4}` : "—"} />
              <Row
                label="Sent"
                value={formatDateTime(
                  deposit.sentAt ??
                    (["SENT", "COMPLETED", "SUCCEEDED"].includes((deposit.state || "").toUpperCase()) ? deposit.createdAtFinix : null)
                )}
              />
              <Row
                label="Arrived"
                value={formatDateTime(
                  deposit.arrivedAt ??
                    (["COMPLETED", "SUCCEEDED"].includes((deposit.state || "").toUpperCase()) ? deposit.createdAtFinix : null)
                )}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-semibold text-slate-900">{value}</p>
    </div>
  );
}
