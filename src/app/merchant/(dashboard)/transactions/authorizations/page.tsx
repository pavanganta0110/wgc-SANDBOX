import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { resolveDateRange } from "@/lib/dateRangePresets";
import TransactionsFilterBar from "@/components/merchant/TransactionsFilterBar";
import CopyableIdBadge from "@/components/merchant/CopyableIdBadge";
import ClickableTableRow from "@/components/merchant/ClickableTableRow";
import StateBadge from "@/components/merchant/StateBadge";
import { formatPersonName } from "@/lib/formatPersonName";

const STATES = ["SUCCEEDED", "FAILED", "PENDING", "CANCELED"];

export default async function AuthorizationsListPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; range?: string; from?: string; to?: string }>;
}) {
  const session = await getSession();
  const churchId = session!.churchId!;
  const { state, range, from, to } = await searchParams;
  const { from: startDate, to: endDate } = resolveDateRange(range, from, to);
  const dateFilter = startDate ? { gte: startDate, ...(endDate ? { lte: endDate } : {}) } : undefined;

  const authorizations = await prisma.finixAuthorization.findMany({
    where: {
      churchId,
      ...(state ? { state } : {}),
      ...(dateFilter ? { createdAtFinix: dateFilter } : {}),
    },
    orderBy: { createdAtFinix: "desc" },
    take: 100,
  });

  const transferIds = authorizations
    .map((a) => a.finixTransferId)
    .filter((id): id is string => Boolean(id));
  const transfers = transferIds.length
    ? await prisma.finixTransfer.findMany({ where: { finixTransferId: { in: transferIds } } })
    : [];
  const transferMap = new Map(transfers.map((t) => [t.finixTransferId, t]));

  const instrumentIds = transfers
    .map((t) => t.finixPaymentInstrumentId)
    .filter((id): id is string => Boolean(id));
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

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 mb-6">Authorizations</h2>

      <TransactionsFilterBar states={STATES} exportHref="/api/merchant/transactions/authorizations/export" />

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-visible">
        {authorizations.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">
            No authorizations match these filters.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50">
                <th className="px-6 py-3">ID</th>
                <th className="px-6 py-3">Created</th>
                <th className="px-6 py-3">Donor</th>
                <th className="px-6 py-3">State</th>
                <th className="px-6 py-3">Voided</th>
                <th className="px-6 py-3 text-right">Requested</th>
                <th className="px-6 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {authorizations.map((a) => {
                const transfer = a.finixTransferId ? transferMap.get(a.finixTransferId) : null;
                const instrument = transfer?.finixPaymentInstrumentId
                  ? instrumentMap.get(transfer.finixPaymentInstrumentId)
                  : null;
                const donor = instrument?.donorId ? donorMap.get(instrument.donorId) : null;

                const cells = (
                  <>
                    <td className="px-6 py-3">
                      <CopyableIdBadge id={a.finixAuthorizationId} />
                    </td>
                    <td className="px-6 py-3 text-slate-600 whitespace-nowrap">
                      {a.createdAtFinix
                        ? new Date(a.createdAtFinix).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                    <td className="px-6 py-3 text-slate-700">
                      {formatPersonName(donor?.name, instrument?.accountHolderName)}
                    </td>
                    <td className="px-6 py-3">
                      <StateBadge state={a.state} />
                      {a.failureCode && <p className="text-xs text-slate-400 mt-0.5">{a.failureCode}</p>}
                    </td>
                    <td className="px-6 py-3 text-slate-500 text-xs">{a.isVoid ? "Yes" : "No"}</td>
                    <td className="px-6 py-3 text-right text-slate-600">
                      {formatCents(a.amountRequestedCents ?? 0)}
                    </td>
                    <td className="px-6 py-3 text-right font-semibold text-slate-900">
                      {formatCents(a.amountCents ?? 0)}
                    </td>
                  </>
                );

                return a.finixTransferId ? (
                  <ClickableTableRow
                    key={a.id}
                    id={a.finixTransferId}
                    className="border-t border-slate-50 hover:bg-slate-50"
                    targetHref={`/merchant/transactions/payments?id=${a.finixTransferId}`}
                  >
                    {cells}
                  </ClickableTableRow>
                ) : (
                  <tr key={a.id} className="border-t border-slate-50">
                    {cells}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
