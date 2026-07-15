import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { resolveDateRange } from "@/lib/dateRangePresets";
import CopyableIdBadge from "@/components/merchant/CopyableIdBadge";
import ClickableTableRow from "@/components/merchant/ClickableTableRow";
import StateBadge from "@/components/merchant/StateBadge";
import { formatPersonName } from "@/lib/formatPersonName";
import { formatDateCDT, formatTimeCDT } from "@/lib/formatDateTimeCDT";
import { formatAchReturnReason } from "@/lib/finix/achReturnReasonCodes";
import BankReturnDetailPanel from "@/components/merchant/BankReturnDetailPanel";
import BankReturnFilterBar from "@/components/merchant/BankReturnFilterBar";
import BankReturnRowActions from "@/components/merchant/BankReturnRowActions";
import { parseVisibleBankReturnColumns } from "@/lib/bankReturnColumns";
import { PinButton } from "@/components/merchant/PaymentDetailActions";
import { Landmark } from "lucide-react";

function StackedDateTime({ date }: { date: Date | null | undefined }) {
  if (!date) return <span className="text-slate-400">—</span>;
  return (
    <div className="whitespace-nowrap">
      <p className="text-slate-700">{formatDateCDT(date)}</p>
      <p className="text-xs text-slate-400">{formatTimeCDT(date)} CDT</p>
    </div>
  );
}

export default async function BankReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string;
    from?: string;
    to?: string;
    last4?: string;
    amount?: string;
    buyer?: string;
    org?: string;
    cols?: string;
    id?: string;
  }>;
}) {
  const session = await getSession();
  const churchId = session!.churchId!;
  const { range, from, to, last4, amount, buyer: buyerFilter, org, cols, id } = await searchParams;
  const { from: startDate, to: endDate } = resolveDateRange(range, from, to);
  const dateFilter = startDate ? { gte: startDate, ...(endDate ? { lte: endDate } : {}) } : undefined;
  const visibleCols = parseVisibleBankReturnColumns(cols);

  const returns = await prisma.bankReturn.findMany({
    where: {
      churchId,
      ...(dateFilter ? { createdAtFinix: dateFilter } : {}),
    },
    orderBy: { createdAtFinix: "desc" },
    take: 200,
  });

  const church = await prisma.church.findUnique({ where: { id: churchId } });

  const instrumentIds = returns
    .map((r) => r.finixPaymentInstrumentId)
    .filter((iid): iid is string => Boolean(iid));
  const instruments = instrumentIds.length
    ? await prisma.finixPaymentInstrumentSnapshot.findMany({
        where: { finixPaymentInstrumentId: { in: instrumentIds } },
      })
    : [];
  const instrumentMap = new Map(instruments.map((i) => [i.finixPaymentInstrumentId, i]));

  const buyerIds = returns.map((r) => r.buyerId).filter((bid): bid is string => Boolean(bid));
  const donors = buyerIds.length
    ? await prisma.donor.findMany({ where: { id: { in: buyerIds } } })
    : [];
  const donorMap = new Map(donors.map((d) => [d.id, d]));

  const rows = returns.filter((r) => {
    const instrument = r.finixPaymentInstrumentId ? instrumentMap.get(r.finixPaymentInstrumentId) : null;
    const donor = r.buyerId ? donorMap.get(r.buyerId) : null;

    if (last4 && instrument?.bankLast4 !== last4) return false;
    if (amount) {
      const cents = Math.round(parseFloat(amount) * 100);
      if (!Number.isNaN(cents) && r.amountCents !== cents) return false;
    }
    if (buyerFilter) {
      const name = donor?.name || instrument?.accountHolderName || "";
      if (!name.toLowerCase().includes(buyerFilter.toLowerCase())) return false;
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
        <h2 className="text-lg font-bold text-slate-900">Bank Returns</h2>
        <PinButton />
      </div>

      <BankReturnFilterBar exportHref="/api/merchant/transactions/bank-returns/export" />

      <div className="flex items-start gap-6">
        <div className="flex-1 min-w-0 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
          {rows.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-slate-500 whitespace-nowrap">
              No bank returns match these filters. ACH returns will show here automatically.
            </p>
          ) : (
            <table className="w-full text-sm min-w-[1100px]">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50">
                  <th className="px-6 py-3">ID</th>
                  {visibleCols.has("created") && <th className="px-6 py-3">Created (CDT)</th>}
                  {visibleCols.has("organization") && <th className="px-6 py-3">Organization</th>}
                  {visibleCols.has("buyer") && <th className="px-6 py-3">Buyer</th>}
                  {visibleCols.has("amount") && <th className="px-6 py-3 text-right">Amount</th>}
                  {visibleCols.has("instrument") && <th className="px-6 py-3">Payment Instrument</th>}
                  {visibleCols.has("reason") && <th className="px-6 py-3">Reason Code</th>}
                  {visibleCols.has("updated") && <th className="px-6 py-3">Updated (CDT)</th>}
                  <th className="px-6 py-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const instrument = r.finixPaymentInstrumentId ? instrumentMap.get(r.finixPaymentInstrumentId) : null;
                  const donor = r.buyerId ? donorMap.get(r.buyerId) : null;
                  const isSelected = id === r.bankReturnId;

                  return (
                    <ClickableTableRow
                      key={r.id}
                      id={r.bankReturnId}
                      className={`border-t border-slate-50 hover:bg-slate-50 ${isSelected ? "bg-slate-50" : ""}`}
                    >
                      <td className="px-6 py-3">
                        <CopyableIdBadge id={r.bankReturnId} />
                      </td>
                      {visibleCols.has("created") && (
                        <td className="px-6 py-3">
                          <StackedDateTime date={r.createdAtFinix} />
                        </td>
                      )}
                      {visibleCols.has("organization") && (
                        <td className="px-6 py-3 text-slate-700">{church?.name || "—"}</td>
                      )}
                      {visibleCols.has("buyer") && (
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
                      {visibleCols.has("instrument") && (
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-2">
                            <Landmark className="w-4 h-4 text-slate-400 shrink-0" />
                            <div>
                              <p className="text-slate-700">••••{instrument?.bankLast4 || "----"}</p>
                              {instrument?.accountHolderName && (
                                <p className="text-xs text-slate-400">{instrument.accountHolderName}</p>
                              )}
                            </div>
                          </div>
                        </td>
                      )}
                      {visibleCols.has("reason") && (
                        <td className="px-6 py-3 text-slate-700">{formatAchReturnReason(r.reasonCode)}</td>
                      )}
                      {visibleCols.has("updated") && (
                        <td className="px-6 py-3">
                          <StackedDateTime date={r.updatedAtFinix} />
                        </td>
                      )}
                      <td className="px-6 py-3">
                        <BankReturnRowActions originalTransferId={r.originalTransferId} bankReturnId={r.bankReturnId} />
                      </td>
                    </ClickableTableRow>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {id && <BankReturnDetailPanel bankReturnId={id} churchId={churchId} />}
      </div>
    </div>
  );
}
