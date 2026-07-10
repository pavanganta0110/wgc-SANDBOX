import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { resolveDateRange } from "@/lib/dateRangePresets";
import CopyableIdBadge from "@/components/merchant/CopyableIdBadge";
import ClickableTableRow from "@/components/merchant/ClickableTableRow";
import StateBadge from "@/components/merchant/StateBadge";
import { formatPersonName } from "@/lib/formatPersonName";
import { formatDateCDT, formatTimeCDT } from "@/lib/formatDateTimeCDT";
import RefundDetailPanel from "@/components/merchant/RefundDetailPanel";
import RefundFilterBar, { parseVisibleColumns } from "@/components/merchant/RefundFilterBar";
import RefundRowActions from "@/components/merchant/RefundRowActions";
import { computeRefundStatus } from "@/lib/finix/refundStatus";
import { PinButton } from "@/components/merchant/PaymentDetailActions";

function StackedDateTime({ date }: { date: Date | null | undefined }) {
  if (!date) return <span className="text-slate-400">—</span>;
  return (
    <div className="whitespace-nowrap">
      <p className="text-slate-700">{formatDateCDT(date)}</p>
      <p className="text-xs text-slate-400">{formatTimeCDT(date)} CDT</p>
    </div>
  );
}

export default async function RefundsPage({
  searchParams,
}: {
  searchParams: Promise<{
    state?: string;
    range?: string;
    from?: string;
    to?: string;
    donor?: string;
    last4?: string;
    org?: string;
    cols?: string;
    id?: string;
  }>;
}) {
  const session = await getSession();
  const churchId = session!.churchId!;
  const { state, range, from, to, donor: donorFilter, last4, org, cols, id } = await searchParams;
  const { from: startDate, to: endDate } = resolveDateRange(range, from, to);
  const dateFilter = startDate ? { gte: startDate, ...(endDate ? { lte: endDate } : {}) } : undefined;
  const visibleCols = parseVisibleColumns(cols);

  const refunds = await prisma.finixRefundOrReversal.findMany({
    where: {
      churchId,
      ...(state ? { state } : {}),
      ...(dateFilter ? { createdAtFinix: dateFilter } : {}),
    },
    orderBy: { createdAtFinix: "desc" },
    take: 200,
  });

  const church = await prisma.church.findUnique({ where: { id: churchId } });

  const originalTransferIds = refunds
    .map((r) => r.finixOriginalTransferId)
    .filter((tid): tid is string => Boolean(tid));
  const transfers = originalTransferIds.length
    ? await prisma.finixTransfer.findMany({ where: { finixTransferId: { in: originalTransferIds } } })
    : [];
  const transferMap = new Map(transfers.map((t) => [t.finixTransferId, t]));

  const instrumentIds = transfers
    .map((t) => t.finixPaymentInstrumentId)
    .filter((iid): iid is string => Boolean(iid));
  const instruments = instrumentIds.length
    ? await prisma.finixPaymentInstrumentSnapshot.findMany({
        where: { finixPaymentInstrumentId: { in: instrumentIds } },
      })
    : [];
  const instrumentMap = new Map(instruments.map((i) => [i.finixPaymentInstrumentId, i]));

  const donorIds = instruments.map((i) => i.donorId).filter((did): did is string => Boolean(did));
  const donors = donorIds.length
    ? await prisma.donor.findMany({ where: { id: { in: donorIds } } })
    : [];
  const donorMap = new Map(donors.map((d) => [d.id, d]));

  // All refunds per original transfer, to compute Full vs Partial correctly
  // even when a payment has multiple partial refunds against it.
  const allRefundsByTransfer = new Map<string, typeof refunds>();
  if (originalTransferIds.length) {
    const allRelated = await prisma.finixRefundOrReversal.findMany({
      where: { finixOriginalTransferId: { in: originalTransferIds } },
    });
    for (const r of allRelated) {
      if (!r.finixOriginalTransferId) continue;
      const list = allRefundsByTransfer.get(r.finixOriginalTransferId) ?? [];
      list.push(r);
      allRefundsByTransfer.set(r.finixOriginalTransferId, list);
    }
  }

  const rows = refunds.filter((r) => {
    const transfer = r.finixOriginalTransferId ? transferMap.get(r.finixOriginalTransferId) : null;
    const instrument = transfer?.finixPaymentInstrumentId ? instrumentMap.get(transfer.finixPaymentInstrumentId) : null;
    const donor = instrument?.donorId ? donorMap.get(instrument.donorId) : null;

    if (last4) {
      const l4 = instrument?.cardLast4 || instrument?.bankLast4;
      if (l4 !== last4) return false;
    }
    if (donorFilter) {
      const name = donor?.name || instrument?.accountHolderName || "";
      if (!name.toLowerCase().includes(donorFilter.toLowerCase())) return false;
    }
    if (org) {
      const orgName = church?.name || "";
      if (!orgName.toLowerCase().includes(org.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <h2 className="text-lg font-bold text-slate-900">Refunds</h2>
        <PinButton />
      </div>

      <RefundFilterBar exportHref="/api/merchant/transactions/refunds/export" />

      <div className="flex items-start gap-6">
        <div className="flex-1 min-w-0 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
          {rows.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-slate-500 whitespace-nowrap">
              No refunds match these filters. Refunds you issue will show here automatically.
            </p>
          ) : (
            <table className="w-full text-sm min-w-[1100px]">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50">
                  <th className="px-6 py-3">ID</th>
                  {visibleCols.has("created") && <th className="px-6 py-3">Created (CDT)</th>}
                  {visibleCols.has("organization") && <th className="px-6 py-3">Organization</th>}
                  {visibleCols.has("donor") && <th className="px-6 py-3">Donor</th>}
                  {visibleCols.has("amount") && <th className="px-6 py-3 text-right">Refund Amount</th>}
                  {visibleCols.has("state") && <th className="px-6 py-3">State</th>}
                  {visibleCols.has("originalPayment") && <th className="px-6 py-3">Original Payment</th>}
                  {visibleCols.has("instrument") && <th className="px-6 py-3">Payment Instrument</th>}
                  {visibleCols.has("instrumentType") && <th className="px-6 py-3">Instrument Type</th>}
                  {visibleCols.has("updated") && <th className="px-6 py-3">Updated (CDT)</th>}
                  <th className="px-6 py-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const transfer = r.finixOriginalTransferId ? transferMap.get(r.finixOriginalTransferId) : null;
                  const instrument = transfer?.finixPaymentInstrumentId
                    ? instrumentMap.get(transfer.finixPaymentInstrumentId)
                    : null;
                  const donor = instrument?.donorId ? donorMap.get(instrument.donorId) : null;
                  const state = (r.state || "").toUpperCase();
                  const isSelected = id === r.finixReversalId;

                  const aggregate = transfer
                    ? computeRefundStatus(transfer, allRefundsByTransfer.get(transfer.finixTransferId) ?? [r])
                    : null;
                  const refundTypeLabel =
                    state === "SUCCEEDED"
                      ? aggregate?.refundStatus === "FULL"
                        ? "Full Refund"
                        : aggregate?.refundStatus === "PARTIAL"
                          ? "Partial Refund"
                          : null
                      : null;

                  return (
                    <ClickableTableRow
                      key={r.id}
                      id={r.finixReversalId}
                      className={`border-t border-slate-50 hover:bg-slate-50 ${isSelected ? "bg-slate-50" : ""}`}
                    >
                      <td className="px-6 py-3">
                        <CopyableIdBadge id={r.finixReversalId} />
                      </td>
                      {visibleCols.has("created") && (
                        <td className="px-6 py-3">
                          <StackedDateTime date={r.createdAtFinix} />
                        </td>
                      )}
                      {visibleCols.has("organization") && (
                        <td className="px-6 py-3 text-slate-700">{church?.name || "—"}</td>
                      )}
                      {visibleCols.has("donor") && (
                        <td className="px-6 py-3">
                          <p className="text-slate-800 font-medium">
                            {formatPersonName(donor?.name, instrument?.accountHolderName)}
                          </p>
                          {donor?.email && <p className="text-xs text-slate-400">{donor.email}</p>}
                        </td>
                      )}
                      {visibleCols.has("amount") && (
                        <td className="px-6 py-3 text-right">
                          <span className="font-bold text-slate-900">{formatCents(r.amountCents ?? 0)}</span>{" "}
                          <span className="text-xs text-slate-400">{r.currency || "USD"}</span>
                        </td>
                      )}
                      {visibleCols.has("state") && (
                        <td className="px-6 py-3">
                          <StateBadge state={state} />
                          {refundTypeLabel && (
                            <p className="text-xs text-slate-400 mt-0.5">{refundTypeLabel}</p>
                          )}
                          {r.failureCode && <p className="text-xs text-red-500 mt-0.5">{r.failureCode}</p>}
                        </td>
                      )}
                      {visibleCols.has("originalPayment") && (
                        <td className="px-6 py-3">
                          <div className="flex flex-col gap-0.5">
                            {r.finixOriginalTransferId ? (
                              <CopyableIdBadge id={r.finixOriginalTransferId} label="Payment ID" />
                            ) : (
                              "—"
                            )}
                            {transfer && (
                              <span className="text-xs text-slate-400">{formatCents(transfer.amountCents ?? 0)}</span>
                            )}
                          </div>
                        </td>
                      )}
                      {visibleCols.has("instrument") && (
                        <td className="px-6 py-3">
                          <p className="text-slate-700">
                            {instrument?.cardBrand || (instrument?.bankLast4 ? "Bank" : "—")}{" "}
                            ••••{instrument?.cardLast4 || instrument?.bankLast4 || "----"}
                          </p>
                          {instrument?.accountHolderName && (
                            <p className="text-xs text-slate-400">{instrument.accountHolderName}</p>
                          )}
                        </td>
                      )}
                      {visibleCols.has("instrumentType") && (
                        <td className="px-6 py-3">
                          <p className="text-slate-700">
                            {instrument?.bankLast4 ? "Bank Account" : instrument ? "Card" : "—"}
                          </p>
                          {instrument?.bankAccountType && (
                            <p className="text-xs text-slate-400">{instrument.bankAccountType}</p>
                          )}
                        </td>
                      )}
                      {visibleCols.has("updated") && (
                        <td className="px-6 py-3">
                          <StackedDateTime date={r.updatedAtFinix} />
                        </td>
                      )}
                      <td className="px-6 py-3">
                        <RefundRowActions
                          originalTransferId={r.finixOriginalTransferId}
                          refundId={r.finixReversalId}
                        />
                      </td>
                    </ClickableTableRow>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {id && <RefundDetailPanel refundId={id} churchId={churchId} />}
      </div>
    </div>
  );
}
