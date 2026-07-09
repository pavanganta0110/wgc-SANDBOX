import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { resolveDateRange } from "@/lib/dateRangePresets";
import AchReturnsTable from "@/components/merchant/AchReturnsTable";
import TransactionsFilterBar from "@/components/merchant/TransactionsFilterBar";
import CopyableIdBadge from "@/components/merchant/CopyableIdBadge";
import ClickableTableRow from "@/components/merchant/ClickableTableRow";
import StateBadge from "@/components/merchant/StateBadge";

const STATES = ["SUCCEEDED", "FAILED", "PENDING", "CANCELED"];

export default async function BankReturnsListPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; range?: string; from?: string; to?: string }>;
}) {
  const session = await getSession();
  const churchId = session!.churchId!;
  const { state, range, from, to } = await searchParams;
  const { from: startDate, to: endDate } = resolveDateRange(range, from, to);
  const dateFilter = startDate ? { gte: startDate, ...(endDate ? { lte: endDate } : {}) } : undefined;

  // Same heuristic used in the Insights "Bank Returns" tab — Finix has no
  // dedicated ACH-return resource, a return shows up as a Transfer whose
  // subtype contains "RETURN". Confirm exact field with Finix before relying
  // on this for reconciliation.
  const returns = await prisma.finixTransfer.findMany({
    where: {
      churchId,
      subtype: { contains: "RETURN" },
      ...(state ? { state } : {}),
      ...(dateFilter ? { createdAtFinix: dateFilter } : {}),
    },
    orderBy: { createdAtFinix: "desc" },
    take: 100,
  });

  const instrumentIds = returns
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

  const byReasonTable = Array.from(
    returns.reduce((map, r) => {
      const reason = r.failureCode || "UNKNOWN";
      const entry = map.get(reason) ?? { volume: 0, count: 0 };
      entry.volume += r.amountCents ?? 0;
      entry.count += 1;
      map.set(reason, entry);
      return map;
    }, new Map<string, { volume: number; count: number }>())
  ).map(([reason, v]) => ({
    reason,
    volume: formatCents(v.volume),
    volumeCents: v.volume,
    count: v.count,
    pctOfReturns: returns.length > 0 ? `${((v.count / returns.length) * 100).toFixed(2)}%` : "—",
  }));

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-bold text-slate-900 mb-6">Bank Returns</h2>

        <TransactionsFilterBar states={STATES} exportHref="/api/merchant/transactions/bank-returns/export" />

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-visible">
          {returns.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-slate-500">
              No bank returns match these filters.
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
                  <th className="px-6 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {returns.map((r) => {
                  const instrument = r.finixPaymentInstrumentId
                    ? instrumentMap.get(r.finixPaymentInstrumentId)
                    : null;
                  const donor = instrument?.donorId ? donorMap.get(instrument.donorId) : null;

                  return (
                    <ClickableTableRow
                      key={r.id}
                      id={r.finixTransferId}
                      className="border-t border-slate-50 hover:bg-slate-50"
                      targetHref={`/merchant/transactions/payments?id=${r.finixTransferId}`}
                    >
                      <td className="px-6 py-3">
                        <CopyableIdBadge id={r.finixTransferId} />
                      </td>
                      <td className="px-6 py-3 text-slate-600 whitespace-nowrap">
                        {r.createdAtFinix
                          ? new Date(r.createdAtFinix).toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })
                          : "—"}
                      </td>
                      <td className="px-6 py-3 text-slate-700">
                        {donor?.name || instrument?.accountHolderName || "—"}
                      </td>
                      <td className="px-6 py-3 text-slate-600">{r.failureCode || "—"}</td>
                      <td className="px-6 py-3">
                        <StateBadge state={r.state} />
                      </td>
                      <td className="px-6 py-3 text-right font-semibold text-slate-900">
                        {formatCents(r.amountCents ?? 0)}
                      </td>
                    </ClickableTableRow>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900">ACH Returns by Reason Code</h3>
        </div>
        <AchReturnsTable rows={byReasonTable} />
      </div>
    </div>
  );
}
