import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { formatCents, formatSignedCents } from "@/lib/format";
import CopyableIdBadge from "@/components/merchant/CopyableIdBadge";
import StateBadge from "@/components/merchant/StateBadge";
import { formatPersonName } from "@/lib/formatPersonName";
import { formatDateTimeCDT as formatDateTime } from "@/lib/formatDateTimeCDT";
import { titleCaseFromSnake as titleCase } from "@/lib/finix/displayFormatters";
import { Row } from "@/components/merchant/detail/DetailDrawerPrimitives";
import { TransactionTimeline } from "@/components/merchant/detail/TransactionTimeline";
import { RelatedResources } from "@/components/merchant/detail/RelatedResources";
import { loadSettlementDetail } from "@/lib/finix/settlementDetail";
import { buildSettlementTimeline } from "@/lib/finix/settlementTimeline";
import { resolveSettlementDisplayStatus, getSettlementStatusLabel } from "@/lib/finix/settlementStatus";
import { resolveMerchantDepositMessage } from "@/lib/finix/merchantDepositMessage";
import { computeReconciliation } from "@/lib/finix/settlementReconciliation";
import { getSettlementPermissions } from "@/lib/finix/settlementPermissions";
import SettlementReconciliationPanel from "@/components/merchant/SettlementReconciliationPanel";
import SettlementAuditHistory from "@/components/merchant/SettlementAuditHistory";

export default async function SettlementFullDetailPage({
  params,
}: {
  params: Promise<{ settlementId: string }>;
}) {
  const session = await getSession();

  // Team-access Checkpoint 4A: explicit wgc_admin rejection — see the
  // matching API-route guard comment for why this back door exists
  // otherwise.
  if (session?.role === "wgc_admin") {
    redirect("/merchant/dashboard");
  }
  const churchId = session!.churchId!;
  const { settlementId } = await params;
  const permissions = getSettlementPermissions(session?.role as "wgc_admin" | "church_admin" | undefined);

  const detail = await loadSettlementDetail(settlementId, churchId);

  if (!detail) {
    return (
      <div>
        <Link href="/merchant/settlements" className="text-sm text-blue-600 hover:underline flex items-center gap-1 mb-4">
          <ArrowLeft className="w-4 h-4" /> All Settlements
        </Link>
        <p className="text-sm text-slate-500">This settlement could not be found.</p>
      </div>
    );
  }

  const { settlement, church, paymentRows, refunds, bankReturns, disputes, fees, deposit, depositBankAccount, hasFundingTransferData } = detail;
  const displayStatus = resolveSettlementDisplayStatus(settlement);
  const depositMessage = resolveMerchantDepositMessage(deposit?.state, hasFundingTransferData);
  const depositBankLast4 = depositBankAccount?.last4 || deposit?.bankAccountLast4 || null;
  const depositBankName = depositBankAccount?.bankName || deposit?.bankName || null;
  const depositAccountType = depositBankAccount?.accountType || deposit?.bankAccountType || null;
  const timeline = buildSettlementTimeline(detail);
  const reconciliation = computeReconciliation(settlement);

  const feesByTransfer = new Map<string, typeof fees>();
  for (const fee of fees) {
    if (!fee.linkedToId) continue;
    const list = feesByTransfer.get(fee.linkedToId) ?? [];
    list.push(fee);
    feesByTransfer.set(fee.linkedToId, list);
  }
  const refundsByTransfer = new Map<string, typeof refunds>();
  for (const r of refunds) {
    if (!r.finixOriginalTransferId) continue;
    const list = refundsByTransfer.get(r.finixOriginalTransferId) ?? [];
    list.push(r);
    refundsByTransfer.set(r.finixOriginalTransferId, list);
  }
  const bankReturnsByTransfer = new Map<string, typeof bankReturns>();
  for (const br of bankReturns) {
    if (!br.originalTransferId) continue;
    const list = bankReturnsByTransfer.get(br.originalTransferId) ?? [];
    list.push(br);
    bankReturnsByTransfer.set(br.originalTransferId, list);
  }
  const disputesByTransfer = new Map<string, typeof disputes>();
  for (const d of disputes) {
    if (!d.finixTransferId) continue;
    const list = disputesByTransfer.get(d.finixTransferId) ?? [];
    list.push(d);
    disputesByTransfer.set(d.finixTransferId, list);
  }

  const feeTotalsByType = new Map<string, number>();
  for (const fee of fees) {
    const type = fee.feeType || "OTHER";
    feeTotalsByType.set(type, (feeTotalsByType.get(type) ?? 0) + (fee.amountCents ?? 0));
  }

  const relatedResources = [
    ...(deposit
      ? [{ type: "Deposit", label: deposit.finixFundingTransferAttemptId, href: `/merchant/deposits?id=${deposit.finixFundingTransferAttemptId}` }]
      : []),
    ...(disputes.length > 0
      ? [{ type: "Disputes", label: `${disputes.length} dispute${disputes.length === 1 ? "" : "s"}`, href: `/merchant/disputes?settlement=${settlement.finixSettlementId}` }]
      : []),
  ];

  return (
    <div>
      <Link href="/merchant/settlements" className="text-sm text-blue-600 hover:underline flex items-center gap-1 mb-4">
        <ArrowLeft className="w-4 h-4" /> All Settlements
      </Link>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          {/* Summary */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-3">
              <span>Settlement · {formatDateTime(settlement.createdAtFinix)}</span>
              <CopyableIdBadge id={settlement.finixSettlementId} />
            </div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-slate-900">{formatCents(settlement.totalAmountCents ?? 0)}</span>
                <span className="text-sm font-semibold text-slate-400">{settlement.currency || "USD"}</span>
              </div>
              <StateBadge state={displayStatus} />
            </div>
            <p className="text-sm text-slate-600">
              Organization: <span className="font-semibold text-slate-900">{church?.name || "—"}</span>
            </p>
          </div>

          {/* Transaction Flow */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Transaction Flow</h3>
            <TransactionTimeline events={timeline} />
          </div>

          {/* Settlement Details */}
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
              <Row label="Trace ID" value={settlement.traceId || "—"} />
            </div>
          </div>

          {/* Included Payments */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Included Payments ({paymentRows.length})</h3>
            {paymentRows.length === 0 ? (
              <p className="text-sm text-slate-500">No payments linked yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[900px]">
                  <thead>
                    <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      <th className="py-2 pr-4">Payment ID</th>
                      <th className="py-2 pr-4">Created</th>
                      <th className="py-2 pr-4">Donor</th>
                      <th className="py-2 pr-4 text-right">Gross</th>
                      <th className="py-2 pr-4 text-right">Fees</th>
                      <th className="py-2 pr-4 text-right">Refunds</th>
                      <th className="py-2 pr-4 text-right">Bank Returns</th>
                      <th className="py-2 pr-4 text-right">Net</th>
                      <th className="py-2 pr-4">State</th>
                      <th className="py-2 pr-4">Method</th>
                      <th className="py-2">Last Four</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentRows.map(({ payment, donor, instrument, transfer }) => {
                      const transferId = payment.finixTransferId || "";
                      const feeTotal = (feesByTransfer.get(transferId) ?? []).reduce((s, f) => s + (f.amountCents ?? 0), 0);
                      const refundTotal = (refundsByTransfer.get(transferId) ?? []).reduce((s, r) => s + (r.amountCents ?? 0), 0);
                      const returnTotal = (bankReturnsByTransfer.get(transferId) ?? []).reduce((s, r) => s + (r.amountCents ?? 0), 0);
                      const gross = payment.amountCents ?? 0;
                      const net = gross - feeTotal - refundTotal - returnTotal;
                      return (
                        <tr key={payment.id} className="border-t border-slate-50">
                          <td className="py-2 pr-4">
                            <CopyableIdBadge id={transferId || payment.id} label={transferId || payment.id} variant="link" />
                          </td>
                          <td className="py-2 pr-4 text-slate-600 whitespace-nowrap">{formatDateTime(payment.createdAt)}</td>
                          <td className="py-2 pr-4 text-slate-700">{formatPersonName(donor?.name, instrument?.accountHolderName)}</td>
                          <td className="py-2 pr-4 text-right text-slate-900 font-semibold">{formatCents(gross)}</td>
                          <td className="py-2 pr-4 text-right text-slate-600">{formatSignedCents(-feeTotal)}</td>
                          <td className="py-2 pr-4 text-right text-slate-600">{formatSignedCents(-refundTotal)}</td>
                          <td className="py-2 pr-4 text-right text-slate-600">{formatSignedCents(-returnTotal)}</td>
                          <td className="py-2 pr-4 text-right font-semibold text-slate-900">{formatCents(net)}</td>
                          <td className="py-2 pr-4"><StateBadge state={transfer?.state || payment.status} /></td>
                          <td className="py-2 pr-4 text-slate-600">
                            {instrument?.cardBrand || (instrument?.bankLast4 ? "Bank Account" : "—")}
                          </td>
                          <td className="py-2 text-slate-600">{instrument?.cardLast4 || instrument?.bankLast4 || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Fee Breakdown */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Fee Breakdown</h3>
            {feeTotalsByType.size === 0 ? (
              <p className="text-sm text-slate-500 mb-4">No fees linked yet.</p>
            ) : (
              <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                {[...feeTotalsByType.entries()].map(([type, total]) => (
                  <Row key={type} label={titleCase(type)} value={formatCents(total)} />
                ))}
              </div>
            )}
            {fees.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[800px]">
                  <thead>
                    <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      <th className="py-2 pr-4">Fee ID</th>
                      <th className="py-2 pr-4">Payment ID</th>
                      <th className="py-2 pr-4">Fee Type</th>
                      <th className="py-2 pr-4 text-right">Amount</th>
                      <th className="py-2 pr-4">Created</th>
                      <th className="py-2">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fees.map((fee) => (
                      <tr key={fee.id} className="border-t border-slate-50">
                        <td className="py-2 pr-4">{fee.finixFeeId ? <CopyableIdBadge id={fee.finixFeeId} label={fee.finixFeeId} variant="link" /> : "—"}</td>
                        <td className="py-2 pr-4">{fee.linkedToId ? <CopyableIdBadge id={fee.linkedToId} label={fee.linkedToId} variant="link" /> : "—"}</td>
                        <td className="py-2 pr-4 text-slate-700">{titleCase(fee.feeType)}</td>
                        <td className="py-2 pr-4 text-right text-slate-900 font-semibold">{formatCents(fee.amountCents ?? 0)}</td>
                        <td className="py-2 pr-4 text-slate-600 whitespace-nowrap">{formatDateTime(fee.createdAtFinix)}</td>
                        <td className="py-2 text-slate-600">{fee.description || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Refunds */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Refunds ({refunds.length})</h3>
            {refunds.length === 0 ? (
              <p className="text-sm text-slate-500">No refunds linked yet.</p>
            ) : (
              <div className="space-y-2">
                {refunds.map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-sm py-1 border-b border-slate-50 last:border-0">
                    <CopyableIdBadge id={r.finixReversalId} label={r.finixReversalId} variant="link" />
                    <span className="text-slate-500">{r.reason ? titleCase(r.reason) : ""}</span>
                    <span className="font-semibold text-slate-700">{formatCents(r.amountCents ?? 0)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bank Returns */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Bank Returns ({bankReturns.length})</h3>
            {bankReturns.length === 0 ? (
              <p className="text-sm text-slate-500">No bank returns linked yet.</p>
            ) : (
              <div className="space-y-2">
                {bankReturns.map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-sm py-1 border-b border-slate-50 last:border-0">
                    <CopyableIdBadge id={r.bankReturnId} label={r.bankReturnId} variant="link" />
                    <span className="text-slate-500">{r.reasonDescription || titleCase(r.reasonCode)}</span>
                    <span className="font-semibold text-slate-700">{formatCents(r.amountCents ?? 0)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Dispute Adjustments */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Dispute Adjustments ({disputes.length})</h3>
            {disputes.length === 0 ? (
              <p className="text-sm text-slate-500">No disputes linked yet.</p>
            ) : (
              <div className="space-y-2">
                {disputes.map((d) => (
                  <div key={d.id} className="flex items-center justify-between text-sm py-1 border-b border-slate-50 last:border-0">
                    <CopyableIdBadge id={d.finixDisputeId} label={d.finixDisputeId} variant="link" />
                    <span className="text-slate-500">{titleCase(d.reason)}</span>
                    <span className="font-semibold text-slate-700">{formatCents(d.amountCents ?? 0)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Other Adjustments */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Other Adjustments</h3>
            {settlement.otherAdjustmentAmountCents == null || settlement.otherAdjustmentAmountCents === 0 ? (
              <p className="text-sm text-slate-500">No unexplained adjustments.</p>
            ) : (
              <div>
                <p className="text-sm font-semibold text-slate-900">{formatSignedCents(settlement.otherAdjustmentAmountCents)}</p>
                <p className="text-xs text-slate-400 mt-1">
                  The processor&apos;s reported net differs from the sum of gross amount minus fees, refunds, returns,
                  and disputes by this amount. This is a computed residual, not a specific reported category.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {/* Organization */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Organization</h3>
            <Row label="Name" value={church?.name || "—"} />
          </div>

          {/* Linked Deposit */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Linked Deposit</h3>
            {!deposit ? (
              <p className="text-sm text-slate-500">{depositMessage}</p>
            ) : (
              <>
                <Row label="Deposit ID" value={<CopyableIdBadge id={deposit.finixFundingTransferAttemptId} />} />
                <Row label="State" value={titleCase(deposit.state)} />
                <Row label="Amount" value={formatCents(deposit.amountCents ?? 0)} />
                {depositBankName && <Row label="Bank Name" value={depositBankName} />}
                {depositAccountType && <Row label="Account Type" value={titleCase(depositAccountType)} />}
                <Row label="Bank Account" value={depositBankLast4 ? `•••• ${depositBankLast4}` : "—"} />
                <Row label="Sent" value={formatDateTime(deposit.sentAt)} />
                <Row label="Arrived" value={formatDateTime(deposit.arrivedAt)} />
              </>
            )}
          </div>

          {/* Related Resources */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Related Resources</h3>
            <RelatedResources resources={relatedResources} />
          </div>

          {/* Reconciliation */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Reconciliation</h3>
            <SettlementReconciliationPanel
              finixSettlementId={settlement.finixSettlementId}
              reconciliationStatus={settlement.reconciliationStatus}
              reconciledAt={settlement.reconciledAt}
              reconciledByEmail={settlement.reconciledByEmail}
              reconciliationNotes={settlement.reconciliationNotes}
              calculatedNetCents={reconciliation.calculatedNetCents}
              processorNetCents={reconciliation.processorNetCents}
              differenceCents={reconciliation.differenceCents}
              canManage={permissions.canManageReconciliation}
            />
          </div>

          {/* Sync Information */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Sync Information</h3>
            <Row label="Last Synced" value={formatDateTime(settlement.lastSyncedAt)} />
            <Row label="Created (Processor)" value={formatDateTime(settlement.createdAtFinix)} />
            <Row label="Updated (Processor)" value={formatDateTime(settlement.updatedAtFinix)} />
          </div>

          {/* Audit History — lazy-loaded, doesn't block the rest of the page */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Audit History</h3>
            <Suspense fallback={<p className="text-sm text-slate-400">Loading…</p>}>
              <SettlementAuditHistory finixSettlementId={settlement.finixSettlementId} churchId={churchId} />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
