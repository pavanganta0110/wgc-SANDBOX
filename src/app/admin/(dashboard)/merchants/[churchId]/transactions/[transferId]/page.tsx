import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getAdminSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import StateBadge from "@/components/merchant/StateBadge";
import CopyableIdBadge from "@/components/merchant/CopyableIdBadge";
import { formatPersonName } from "@/lib/formatPersonName";
import { formatDateTimeCDT as formatDateTime } from "@/lib/formatDateTimeCDT";
import { sourceLabel } from "@/lib/finix/displayFormatters";

// Admin mirror of the merchant's own per-transaction "Donation Breakdown"
// card (src/app/merchant/(dashboard)/transactions/payments/[transferId]/page.tsx)
// — same fields, same source data, so what admin sees here matches exactly
// what the merchant sees on their end for the same transaction.
export default async function AdminTransactionDetailPage({
  params,
}: {
  params: Promise<{ churchId: string; transferId: string }>;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const { churchId, transferId } = await params;

  const transfer = await prisma.finixTransfer.findFirst({
    where: { churchId, finixTransferId: transferId },
  });

  if (!transfer) {
    return (
      <div>
        <Link
          href={`/admin/merchants/${churchId}/transactions`}
          className="text-sm text-blue-600 hover:underline flex items-center gap-1 mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> All Transactions
        </Link>
        <p className="text-sm text-slate-500">This payment could not be found.</p>
      </div>
    );
  }

  const [instrument, payment, invoicePayment] = await Promise.all([
    transfer.finixPaymentInstrumentId
      ? prisma.finixPaymentInstrumentSnapshot.findUnique({
          where: { finixPaymentInstrumentId: transfer.finixPaymentInstrumentId },
        })
      : Promise.resolve(null),
    prisma.payment.findFirst({ where: { finixTransferId: transfer.finixTransferId, churchId } }),
    prisma.invoicePayment.findFirst({ where: { finixTransferId: transfer.finixTransferId, churchId } }),
  ]);

  const donor = instrument?.donorId ? await prisma.donor.findUnique({ where: { id: instrument.donorId } }) : null;
  const settlement = transfer.finixSettlementId
    ? await prisma.finixSettlement.findUnique({ where: { finixSettlementId: transfer.finixSettlementId } })
    : null;

  return (
    <div>
      <Link
        href={`/admin/merchants/${churchId}/transactions`}
        className="text-sm text-blue-600 hover:underline flex items-center gap-1 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> All Transactions
      </Link>

      <div className="max-w-2xl space-y-6">
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
            <StateBadge state={transfer.state} />
          </div>
          <p className="text-sm text-slate-600">
            Donor:{" "}
            <span className="font-semibold text-slate-900">
              {formatPersonName(donor?.name, instrument?.accountHolderName)}
            </span>
            {" · "}
            Payment Instrument:{" "}
            <span className="font-semibold text-slate-900">
              {instrument?.cardBrand || (instrument?.bankLast4 ? "Bank" : "")} ••••
              {instrument?.cardLast4 || instrument?.bankLast4 || "----"}
            </span>
          </p>
        </div>

        {(() => {
          if (invoicePayment) {
            const netPrincipalCents = Math.max(0, invoicePayment.grossAmountCents - invoicePayment.refundedCents);
            const netFeeCents = invoicePayment.customerCoveredFee
              ? Math.max(0, invoicePayment.feeContributionCents - invoicePayment.feeContributionRefundedCents)
              : 0;
            return (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                <h3 className="text-sm font-bold text-slate-900 mb-4">Donation Breakdown</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Invoice Amount</span>
                    <span className="font-semibold text-slate-900">{formatCents(netPrincipalCents)}</span>
                  </div>
                  {invoicePayment.customerCoveredFee && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Processing Fee</span>
                      <span className="font-semibold text-slate-900">{formatCents(netFeeCents)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Paid By</span>
                    <span className="font-semibold text-slate-900">
                      {invoicePayment.customerCoveredFee ? "Donor" : "Organization"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 font-bold">
                    <span className="text-slate-900">Total Charged to Donor</span>
                    <span className="text-slate-900">{formatCents(netPrincipalCents + netFeeCents)}</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 font-bold text-slate-900">
                    <span className="text-slate-600">Net Amount</span>
                    <span className="text-slate-900">{formatCents(invoicePayment.netAmountCents)}</span>
                  </div>
                </div>
              </div>
            );
          }

          const rawTransfer = transfer.rawJsonRedacted as any;
          const rawSupplementalFee = rawTransfer?.supplemental_fee || 0;
          const supplementalFeeCents = payment?.feeCoveredCents ?? rawSupplementalFee ?? 0;
          const percentageBps = payment?.percentageBps ?? 0;
          const fixedFeeCents = payment?.fixedFeeCents ?? 0;
          const hasFeeData = supplementalFeeCents > 0 || percentageBps > 0 || fixedFeeCents > 0 || rawSupplementalFee > 0;

          const totalCharged = transfer.amountCents ?? 0;
          const intendedDonation =
            payment?.donationAmountCents ??
            (payment?.donorCoversFee === true ? totalCharged - supplementalFeeCents : totalCharged);

          let donorCoversFee = payment?.donorCoversFee;
          if (donorCoversFee == null && hasFeeData) {
            if (totalCharged > intendedDonation) {
              donorCoversFee = true;
            } else if (totalCharged === intendedDonation) {
              donorCoversFee = false;
            }
          }

          const estimatedNet =
            payment?.merchantExpectedNetCents ??
            (donorCoversFee === true ? intendedDonation : intendedDonation - supplementalFeeCents);

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
                    {donorCoversFee === true ? "Donor" : donorCoversFee === false ? "Organization" : "Historical / Uncertain"}
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

                {settlement && settlement.netAmountCents != null && (
                  <p className="text-[11px] text-slate-500 pt-2 mt-1 border-t border-slate-100">
                    This net is an estimate based on this transaction&apos;s own processing fee. The settlement it
                    belongs to (<CopyableIdBadge id={settlement.finixSettlementId} />) may include additional
                    settlement-level fees (e.g. a funding/payout fee) not reflected here. Settlement&apos;s actual
                    net: <span className="font-semibold text-slate-700">{formatCents(settlement.netAmountCents)}</span>
                  </p>
                )}
              </div>
            </div>
          );
        })()}

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h3 className="text-sm font-bold text-slate-900 mb-4">Payment Details</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-slate-500">Created Via</p>
              <p className="font-semibold text-slate-900">{sourceLabel(transfer.source)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Fund / Designation</p>
              <p className="font-semibold text-slate-900">{payment?.fundName || "Unspecified"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Statement Descriptor</p>
              <p className="font-semibold text-slate-900">{transfer.statementDescriptor || "—"}</p>
            </div>
            {transfer.failureCode && (
              <div>
                <p className="text-xs text-slate-500">Failure Code</p>
                <p className="font-semibold text-slate-900">{transfer.failureCode}</p>
              </div>
            )}
            {transfer.failureMessage && (
              <div>
                <p className="text-xs text-slate-500">Failure Reason</p>
                <p className="font-semibold text-slate-900">{transfer.failureMessage}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
