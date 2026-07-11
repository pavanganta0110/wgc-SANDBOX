import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { resolveDateRange } from "@/lib/dateRangePresets";
import TransactionsFilterBar from "@/components/merchant/TransactionsFilterBar";
import CopyableIdBadge from "@/components/merchant/CopyableIdBadge";
import ClickableTableRow from "@/components/merchant/ClickableTableRow";
import StateBadge from "@/components/merchant/StateBadge";
import SettlementDetailPanel from "@/components/merchant/SettlementDetailPanel";
import { formatDateTimeCDT } from "@/lib/formatDateTimeCDT";

const STATES = ["ACCRUING", "PENDING", "SETTLED"];

export default async function SettlementsPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; range?: string; from?: string; to?: string; id?: string }>;
}) {
  const session = await getSession();
  const churchId = session!.churchId!;
  const { state, range, from, to, id } = await searchParams;
  const { from: startDate, to: endDate } = resolveDateRange(range, from, to);
  const dateFilter = startDate ? { gte: startDate, ...(endDate ? { lte: endDate } : {}) } : undefined;

  const settlements = await prisma.finixSettlement.findMany({
    where: {
      churchId,
      ...(state ? { state } : {}),
      ...(dateFilter ? { createdAtFinix: dateFilter } : {}),
    },
    orderBy: { createdAtFinix: "desc" },
    take: 100,
  });

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 mb-6">Settlements</h2>

      <TransactionsFilterBar states={STATES} exportHref="/api/merchant/transactions/settlements/export" />

      <div className="flex items-start gap-6">
        <div className="flex-1 min-w-0 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-visible">
          {settlements.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-slate-500">
              No settlement batches match these filters.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50">
                  <th className="px-6 py-3">ID</th>
                  <th className="px-6 py-3">Created</th>
                  <th className="px-6 py-3">State</th>
                  <th className="px-6 py-3 text-right">Net Amount</th>
                  <th className="px-6 py-3 text-right">Total Amount</th>
                </tr>
              </thead>
              <tbody>
                {settlements.map((s) => (
                  <ClickableTableRow
                    key={s.id}
                    id={s.finixSettlementId}
                    className={`border-t border-slate-50 hover:bg-slate-50 ${
                      id === s.finixSettlementId ? "bg-slate-50" : ""
                    }`}
                  >
                    <td className="px-6 py-3">
                      <CopyableIdBadge id={s.finixSettlementId} />
                    </td>
                    <td className="px-6 py-3 text-slate-600 whitespace-nowrap">
                      {formatDateTimeCDT(s.createdAtFinix)}
                    </td>
                    <td className="px-6 py-3">
                      <StateBadge state={s.state} />
                    </td>
                    <td className="px-6 py-3 text-right text-slate-600">
                      {formatCents(s.netAmountCents ?? 0)}
                    </td>
                    <td className="px-6 py-3 text-right font-semibold text-slate-900">
                      {formatCents(s.totalAmountCents ?? 0)}
                    </td>
                  </ClickableTableRow>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {id && <SettlementDetailPanel settlementId={id} churchId={churchId} />}
      </div>
    </div>
  );
}
