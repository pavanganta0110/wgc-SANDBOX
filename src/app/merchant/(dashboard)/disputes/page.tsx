import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { resolveDateRange } from "@/lib/dateRangePresets";
import TransactionsFilterBar from "@/components/merchant/TransactionsFilterBar";
import CopyableIdBadge from "@/components/merchant/CopyableIdBadge";
import ClickableTableRow from "@/components/merchant/ClickableTableRow";
import StateBadge from "@/components/merchant/StateBadge";
import DisputeDetailPanel from "@/components/merchant/DisputeDetailPanel";
import { formatPersonName } from "@/lib/formatPersonName";
import { formatDateTimeCDT, formatDateCDT } from "@/lib/formatDateTimeCDT";

// Must match mapFinixDisputeStateToWgcStatus's actual output (lowercase
// pending/won/lost/expired), not transfer-shaped values like SUCCEEDED/
// FAILED/CANCELED — those never match what's stored, so the filter
// previously returned zero rows for almost every selection.
const STATES = ["pending", "won", "lost", "expired"];

export default async function DisputesPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; range?: string; from?: string; to?: string; id?: string }>;
}) {
  const session = await getSession();
  const churchId = session!.churchId!;
  const { state, range, from, to, id } = await searchParams;
  const { from: startDate, to: endDate } = resolveDateRange(range, from, to);
  const dateFilter = startDate ? { gte: startDate, ...(endDate ? { lte: endDate } : {}) } : undefined;

  const disputes = await prisma.finixDispute.findMany({
    where: {
      churchId,
      ...(state ? { state } : {}),
      ...(dateFilter ? { createdAtFinix: dateFilter } : {}),
    },
    orderBy: { createdAtFinix: "desc" },
    take: 100,
  });

  const transferIds = disputes
    .map((d) => d.finixTransferId)
    .filter((tid): tid is string => Boolean(tid));
  const transfers = transferIds.length
    ? await prisma.finixTransfer.findMany({ where: { finixTransferId: { in: transferIds } } })
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

  function titleCase(s: string | null | undefined) {
    if (!s) return "—";
    return s
      .split("_")
      .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
      .join(" ");
  }

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 mb-6">Disputes</h2>

      <TransactionsFilterBar states={STATES} exportHref="/api/merchant/transactions/disputes/export" />

      <div className="flex items-start gap-6">
        <div className="flex-1 min-w-0 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-visible">
          {disputes.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-slate-500">
              No disputes match these filters.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50">
                  <th className="px-6 py-3">ID</th>
                  <th className="px-6 py-3">Created</th>
                  <th className="px-6 py-3">Donor</th>
                  <th className="px-6 py-3">Reason</th>
                  <th className="px-6 py-3">State</th>
                  <th className="px-6 py-3">Evidence Due</th>
                  <th className="px-6 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {disputes.map((d) => {
                  const transfer = d.finixTransferId ? transferMap.get(d.finixTransferId) : null;
                  const instrument = transfer?.finixPaymentInstrumentId
                    ? instrumentMap.get(transfer.finixPaymentInstrumentId)
                    : null;
                  const donor = instrument?.donorId ? donorMap.get(instrument.donorId) : null;

                  return (
                    <ClickableTableRow
                      key={d.id}
                      id={d.finixDisputeId}
                      className={`border-t border-slate-50 hover:bg-slate-50 ${
                        id === d.finixDisputeId ? "bg-slate-50" : ""
                      }`}
                    >
                      <td className="px-6 py-3">
                        <CopyableIdBadge id={d.finixDisputeId} />
                      </td>
                      <td className="px-6 py-3 text-slate-600 whitespace-nowrap">
                        {formatDateTimeCDT(d.createdAtFinix)}
                      </td>
                      <td className="px-6 py-3 text-slate-700">
                        {formatPersonName(donor?.name, instrument?.accountHolderName)}
                      </td>
                      <td className="px-6 py-3 text-slate-600">{titleCase(d.reason)}</td>
                      <td className="px-6 py-3">
                        <StateBadge state={d.state} />
                      </td>
                      <td className="px-6 py-3 text-slate-600 whitespace-nowrap">
                        {formatDateCDT(d.evidenceDueAt)}
                      </td>
                      <td className="px-6 py-3 text-right font-semibold text-slate-900">
                        {formatCents(d.amountCents ?? 0)}
                      </td>
                    </ClickableTableRow>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {id && <DisputeDetailPanel disputeId={id} churchId={churchId} />}
      </div>
    </div>
  );
}
