import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { resolveViewScope } from "@/lib/auth/viewScope";
import { buildFinixTransferScope } from "@/lib/auth/scopes";
import { formatCents } from "@/lib/format";
import { reconcilePaymentFees } from "@/lib/payments/backfill";
import CopyableIdBadge from "@/components/merchant/CopyableIdBadge";
import StateBadge from "@/components/merchant/StateBadge";
import IssueRefundButton from "@/components/merchant/IssueRefundButton";
import CreateReceiptButton from "@/components/merchant/CreateReceiptButton";
import { computeRefundStatus, resolveDisplayStatus } from "@/lib/finix/refundStatus";
import { formatPersonName } from "@/lib/formatPersonName";
import { formatDateTimeCDT as formatDateTime } from "@/lib/formatDateTimeCDT";
import {
  titleCaseFromSnake as titleCaseFromSnakeBase,
  instrumentStateLabel,
  sourceLabel,
  settlementStateLabel,
} from "@/lib/finix/displayFormatters";
import { mapFeeType } from "@/lib/fees/feeTypeLabels";

const titleCaseFromSnake = (value: string | null | undefined) => titleCaseFromSnakeBase(value, "Fee");

import { checkRefundEligibility } from "@/lib/payments/refundEligibility";

export default async function PaymentFullDetailPage({
  params,
}: {
  params: Promise<{ transferId: string }>;
}) {
  const auth = await requireMerchantSession();
  const churchId = auth.churchId;
  const { transferId } = await params;

  // Team-access Checkpoint 4A: id + scope combined via AND (not
  // fetch-then-check) — FinixTransfer has no attribution column of its
  // own, so scope is bridged through Payment.attributedUserId (see
  // buildFinixTransferScope). AND, not a merged object, because both the
  // literal transferId and the scope's `finixTransferId: {in:[...]}` (for a
  // user-scoped view) target the same field.
  const viewScope = await resolveViewScope(auth);
  const transferScope = await buildFinixTransferScope(auth, viewScope);

  let transfer = await prisma.finixTransfer.findFirst({
    where: { AND: [{ finixTransferId: transferId }, transferScope] },
  });

  if (transfer && transfer.state === "PENDING") {
    try {
      const { reconcilePendingTransfer } = await import("@/lib/finix/sync/paymentReconciliation");
      const result = await reconcilePendingTransfer(transferId);
      if (result.changed) {
        transfer = await prisma.finixTransfer.findFirst({ where: { AND: [{ finixTransferId: transferId }, transferScope] } });
      }
    } catch (err) {
      console.error("Payment detail reconciliation failed:", err);
    }
  }

  if (!transfer) {
    return (
      <div>
        <Link href="/merchant/transactions/payments" className="text-sm text-blue-600 hover:underline flex items-center gap-1 mb-4">
          <ArrowLeft className="w-4 h-4" /> All Payments
        </Link>
        <p className="text-sm text-slate-500">This payment could not be found.</p>
      </div>
    );
  }

  let [instrument, refunds, disputes, fees, payment, bankReturns] = await Promise.all([
    transfer.finixPaymentInstrumentId
      ? prisma.finixPaymentInstrumentSnapshot.findUnique({
          where: { finixPaymentInstrumentId: transfer.finixPaymentInstrumentId },
        })
      : Promise.resolve(null),
    prisma.finixRefundOrReversal.findMany({
      where: { finixOriginalTransferId: transfer.finixTransferId },
      orderBy: { createdAtFinix: "asc" },
    }),
    prisma.finixDispute.findMany({
      where: { finixTransferId: transfer.finixTransferId },
      orderBy: { createdAtFinix: "asc" },
    }),
    prisma.finixFee.findMany({ where: { linkedToId: transfer.finixTransferId } }),
    prisma.payment.findFirst({ where: { finixTransferId: transfer.finixTransferId, churchId } }),
    prisma.bankReturn.findMany({
      where: { originalTransferId: transfer.finixTransferId, churchId },
    }),
  ]);

  if (payment && !payment.feeCalculationVersion) {
    const reconciled = await reconcilePaymentFees(payment.id);
    if (reconciled) {
      payment = reconciled;
    }
  }

  const donor = instrument?.donorId ? await prisma.donor.findUnique({ where: { id: instrument.donorId } }) : null;
  const settlement = transfer.finixSettlementId
    ? await prisma.finixSettlement.findUnique({ where: { finixSettlementId: transfer.finixSettlementId } })
    : null;

  const feesTotal = fees.reduce((sum, f) => sum + (f.amountCents || 0), 0);
  const refund = computeRefundStatus(transfer, refunds);
  const displayStatus = resolveDisplayStatus(transfer.state, refund);
  const eligibility = checkRefundEligibility(transfer, refunds, bankReturns, churchId);
  const remainingRefundableCents =
    (transfer.state || "").toUpperCase() === "SUCCEEDED" ? refund.netAmountCents : 0;

  type FlowEvent = { label: string; sublabel?: string; date: Date };
  const flowEvents: { label: string; sublabel?: string; date: Date | null }[] = [
    {
      label: `${formatCents(transfer.amountCents ?? 0)} USD Payment ${(transfer.state || "").charAt(0)}${(transfer.state || "").slice(1).toLowerCase()}`,
      date: transfer.createdAtFinix,
    },
  ];
  if (settlement) {
    // Finix doesn't expose a per-transfer "joined this settlement at"
    // timestamp, only the settlement batch's own window_start_time (when
    // the batch first opened, which can be well before this transfer
    // joined it) — using the transfer's own timestamp here is the honest
    // choice, not a real "added at" time.
    flowEvents.push({
      label: `Payment Added to ${settlementStateLabel(settlement.state)} Settlement`,
      sublabel: `Part of ${formatCents(settlement.totalAmountCents ?? 0)} USD Settlement`,
      date: transfer.createdAtFinix,
    });
  }
  for (const r of refunds) {
    flowEvents.push({
      label: `Refund ${(r.state || "").charAt(0)}${(r.state || "").slice(1).toLowerCase()}`,
      sublabel: `${formatCents(r.amountCents ?? 0)} USD`,
      date: r.createdAtFinix,
    });
  }
  for (const d of disputes) {
    flowEvents.push({
      label: `Dispute ${(d.state || "").charAt(0)}${(d.state || "").slice(1).toLowerCase()}`,
      sublabel: d.reason || undefined,
      date: d.createdAtFinix,
    });
  }
  const flow = flowEvents
    .filter((e): e is FlowEvent => e.date !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  return (
    <div>
      <Link href="/merchant/transactions/payments" className="text-sm text-blue-600 hover:underline flex items-center gap-1 mb-4">
        <ArrowLeft className="w-4 h-4" /> All Payments
      </Link>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-3">
              <span>Payment · {formatDateTime(transfer.createdAtFinix)}</span>
              <div className="flex items-center gap-1.5">
                <CopyableIdBadge id={transfer.finixTransferId} />
                {transfer.traceId && <CopyableIdBadge id={transfer.traceId} label="Trace ID" />}
              </div>
            </div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-slate-900">{formatCents(transfer.amountCents ?? 0)}</span>
                <span className="text-sm font-semibold text-slate-400">{transfer.currency || "USD"}</span>
              </div>
              <StateBadge state={displayStatus} />
            </div>
            {refund.refundStatus !== "NONE" && (
              <div className="grid grid-cols-3 gap-4 mb-3 text-sm">
                <div>
                  <p className="text-xs text-slate-500">Payment Status</p>
                  <p className="font-semibold text-slate-900">
                    {(transfer.state || "").charAt(0)}
                    {(transfer.state || "").slice(1).toLowerCase()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Refund Status</p>
                  <p className="font-semibold text-amber-700">
                    {refund.refundStatus === "FULL"
                      ? "Refunded"
                      : refund.refundStatus === "PARTIAL"
                        ? "Partially Refunded"
                        : "Refund Pending"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Net Amount</p>
                  <p className="font-semibold text-slate-900">{formatCents(refund.netAmountCents)}</p>
                </div>
              </div>
            )}
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

          {(() => {
            const rawTransfer = transfer.rawJsonRedacted as any;
            const rawSupplementalFee = rawTransfer?.supplemental_fee || 0;
            const supplementalFeeCents = payment?.feeCoveredCents ?? rawSupplementalFee ?? 0;
            const percentageBps = payment?.percentageBps ?? 0;
            const fixedFeeCents = payment?.fixedFeeCents ?? 0;
            const hasFeeData = supplementalFeeCents > 0 || percentageBps > 0 || fixedFeeCents > 0 || rawSupplementalFee > 0;

            const totalCharged = transfer.amountCents ?? 0;
            const intendedDonation = payment?.donationAmountCents ?? (
              payment?.donorCoversFee === true
                ? totalCharged - supplementalFeeCents
                : totalCharged
            );

            let donorCoversFee = payment?.donorCoversFee;
            if (donorCoversFee == null && hasFeeData) {
              if (totalCharged > intendedDonation) {
                donorCoversFee = true;
              } else if (totalCharged === intendedDonation) {
                donorCoversFee = false;
              }
            }

            const estimatedNet = payment?.merchantExpectedNetCents ?? (
              donorCoversFee === true
                ? intendedDonation
                : intendedDonation - supplementalFeeCents
            );

            if (!payment && !hasFeeData) return null;

            return (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                <h3 className="text-sm font-bold text-slate-900 mb-4">Donation Breakdown</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Intended Donation Amount</span>
                    <span className="font-semibold text-slate-900">{formatCents(intendedDonation)}</span>
                  </div>

                  {hasFeeData && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Processing Fee</span>
                      <span className="font-semibold text-slate-900">{formatCents(supplementalFeeCents)}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Paid By</span>
                    <span className="font-semibold text-slate-900">
                      {donorCoversFee === true
                        ? "Donor"
                        : donorCoversFee === false
                          ? "Organization"
                          : "Historical / Uncertain"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 font-bold">
                    <span className="text-slate-900">Total Charged to Donor</span>
                    <span className="text-slate-900">{formatCents(totalCharged)}</span>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 font-bold text-slate-900">
                    <span className="text-slate-600">Estimated Organization Net</span>
                    <span className="text-slate-900">{formatCents(estimatedNet)}</span>
                  </div>

                  {payment?.feeCalculationVersion === "historical_backfilled" && (
                    <p className="text-[11px] text-amber-600 italic mt-2">
                      * Reconciled from historical Finix Transfer metadata.
                    </p>
                  )}
                </div>
              </div>
            );
          })()}

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Transaction Flow</h3>
            <div className="space-y-4">
              {flow.map((event, i) => (
                <div key={i} className="flex gap-3">
                  <div className="flex flex-col items-center pt-1">
                    <span className="w-2 h-2 rounded-full bg-slate-400" />
                    {i < flow.length - 1 && <span className="w-px flex-1 bg-slate-200 mt-1" />}
                  </div>
                  <div className="pb-1">
                    <p className="text-sm font-semibold text-slate-800">{event.label}</p>
                    {event.sublabel && <p className="text-xs text-slate-500">{event.sublabel}</p>}
                    <p className="text-xs text-slate-400">{formatDateTime(event.date)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Payment Details</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <Row label="Created Via" value={sourceLabel(transfer.source)} />
              <Row label="Statement Descriptor" value={transfer.statementDescriptor || "—"} />
              {transfer.failureCode && <Row label="Failure Code" value={transfer.failureCode} />}
              {transfer.failureMessage && <Row label="Failure Reason" value={transfer.failureMessage} />}
            </div>
          </div>

          {fees.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <h3 className="text-sm font-bold text-slate-900 mb-4">Associated Fees</h3>
              <div className="space-y-2">
                {fees.map((f) => {
                  const mapped = mapFeeType(f.feeType);
                  return (
                    <div key={f.id} className="flex items-center justify-between text-sm">
                      <div>
                        <p className="font-semibold text-slate-700">{mapped.label}</p>
                        <p className="text-xs text-slate-400">{mapped.description}</p>
                        <p className="text-xs text-slate-400">Processor · {formatDateTime(f.createdAtFinix)}</p>
                      </div>
                      <span className="font-semibold text-slate-900 whitespace-nowrap ml-4">
                        {formatCents(f.amountCents ?? 0)} {f.currency || "USD"}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between text-sm font-bold text-slate-900 mt-3 pt-3 border-t border-slate-100">
                <span>Estimated Total</span>
                <span>{formatCents(feesTotal)} USD</span>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900">Refunds</h3>
              {eligibility.eligible ? (
                <IssueRefundButton transferId={transfer.finixTransferId} maxAmountCents={remainingRefundableCents} />
              ) : (
                <span className="text-xs font-semibold text-slate-400 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1">
                  {eligibility.reason || "This transaction is not eligible for a refund."}
                </span>
              )}
            </div>
            {refunds.length === 0 ? (
              <p className="text-sm text-slate-500">No refunds associated with this payment.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold text-slate-400 uppercase">
                    <th className="pb-2">ID</th>
                    <th className="pb-2">Created</th>
                    <th className="pb-2">State</th>
                    <th className="pb-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {refunds.map((r) => (
                    <tr key={r.id} className="border-t border-slate-50">
                      <td className="py-2">
                        <CopyableIdBadge id={r.finixReversalId} />
                      </td>
                      <td className="py-2 text-slate-600">{formatDateTime(r.createdAtFinix)}</td>
                      <td className="py-2">
                        <StateBadge state={r.state} />
                      </td>
                      <td className="py-2 text-right font-semibold text-slate-900">{formatCents(r.amountCents ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Disputes</h3>
            {disputes.length === 0 ? (
              <p className="text-sm text-slate-500">No disputes associated with this payment at this moment.</p>
            ) : (
              <div className="space-y-2">
                {disputes.map((d) => (
                  <div key={d.id} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-semibold text-slate-700">{d.reason || "Dispute"}</p>
                      <p className="text-xs text-slate-400">{formatDateTime(d.createdAtFinix)}</p>
                    </div>
                    <StateBadge state={d.state} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900">Receipt</h3>
              <CreateReceiptButton transferId={transfer.finixTransferId} />
            </div>
            {payment?.receiptSentAt ? (
              <Row label="Sent" value={formatDateTime(payment.receiptSentAt)} />
            ) : (
              <p className="text-sm text-slate-500">No past receipt created or sent at this time.</p>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Donor</h3>
            <Row label="Name" value={formatPersonName(donor?.name, instrument?.accountHolderName)} />
            <Row label="Email" value={donor?.email || "—"} />
            <Row label="Phone" value={donor?.phone || "—"} />
          </div>

          {instrument && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <h3 className="text-sm font-bold text-slate-900 mb-4">Payment Instrument</h3>
              <Row label="State" value={instrumentStateLabel(instrument.state)} />
              <Row label="Type" value={instrument.bankLast4 ? "Bank Account" : "Card"} />
              {instrument.cardBrand && <Row label="Brand" value={instrument.cardBrand} />}
              <Row label="Account Holder Name" value={instrument.accountHolderName || "—"} />
              <Row
                label="Masked Number"
                value={instrument.cardLast4 || instrument.bankLast4 ? `••••${instrument.cardLast4 || instrument.bankLast4}` : "—"}
              />
              {instrument.cardExpirationMonth && instrument.cardExpirationYear && (
                <Row label="Expiration" value={`${instrument.cardExpirationMonth}/${instrument.cardExpirationYear}`} />
              )}
              {instrument.bankAccountType && <Row label="Account Type" value={instrument.bankAccountType} />}
              {instrument.securityCodeVerification && (
                <Row label="CVV Verification" value={titleCaseFromSnake(instrument.securityCodeVerification)} />
              )}
              {instrument.addressVerification && (
                <Row label="Address Verification" value={titleCaseFromSnake(instrument.addressVerification)} />
              )}
              {instrument.issuerCountry && <Row label="Issuer Country" value={instrument.issuerCountry} />}
              {instrument.addressCountry && <Row label="Address Country" value={instrument.addressCountry} />}
              {instrument.disabledMessage && <Row label="Disabled Reason" value={instrument.disabledMessage} />}
              <Row label="Created" value={formatDateTime(instrument.createdAtFinix)} />
            </div>
          )}

          {settlement && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <h3 className="text-sm font-bold text-slate-900 mb-4">Related Resources</h3>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Settlement</span>
                <CopyableIdBadge id={settlement.finixSettlementId} label={settlement.finixSettlementId} variant="link" />
              </div>
            </div>
          )}

          {transfer.tagsJson && typeof transfer.tagsJson === "object" && !Array.isArray(transfer.tagsJson) && Object.keys(transfer.tagsJson).length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <h3 className="text-sm font-bold text-slate-900 mb-4">Tags</h3>
              <div className="space-y-1.5">
                {Object.entries(transfer.tagsJson as Record<string, string>).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">{key}</span>
                    <span className="font-mono text-xs text-slate-700">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm py-1">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-700 text-right">{value}</span>
    </div>
  );
}
