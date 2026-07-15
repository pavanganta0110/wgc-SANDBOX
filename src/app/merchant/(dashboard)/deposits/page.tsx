import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { resolveDateRange } from "@/lib/dateRangePresets";
import CopyableIdBadge from "@/components/merchant/CopyableIdBadge";
import ClickableTableRow from "@/components/merchant/ClickableTableRow";
import StateBadge from "@/components/merchant/StateBadge";
import { formatDateCDT, formatTimeCDT } from "@/lib/formatDateTimeCDT";
import DepositDetailPanel from "@/components/merchant/DepositDetailPanel";
import DepositFilterBar from "@/components/merchant/DepositFilterBar";
import DepositRowActions from "@/components/merchant/DepositRowActions";
import { parseVisibleDepositColumns, formatFundingSpeed } from "@/lib/depositColumns";
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

export default async function DepositsPage({
  searchParams,
}: {
  searchParams: Promise<{
    state?: string;
    range?: string;
    from?: string;
    to?: string;
    amount?: string;
    org?: string;
    cols?: string;
    id?: string;
  }>;
}) {
  const session = await getSession();
  const churchId = session!.churchId!;
  const { state, range, from, to, amount, org, cols, id } = await searchParams;
  const { from: startDate, to: endDate } = resolveDateRange(range, from, to);
  const dateFilter = startDate ? { gte: startDate, ...(endDate ? { lte: endDate } : {}) } : undefined;
  const visibleCols = parseVisibleDepositColumns(cols);

  const deposits = await prisma.finixFundingTransferAttempt.findMany({
    where: {
      churchId,
      ...(state ? { state } : {}),
      ...(dateFilter ? { createdAtFinix: dateFilter } : {}),
    },
    orderBy: { createdAtFinix: "desc" },
    take: 200,
  });

  const church = await prisma.church.findUnique({ where: { id: churchId } });

  const rows = deposits.filter((d) => {
    if (amount) {
      const cents = Math.round(parseFloat(amount) * 100);
      if (!Number.isNaN(cents) && d.amountCents !== cents) return false;
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
        <h2 className="text-lg font-bold text-slate-900">Deposits</h2>
        <PinButton />
      </div>

      <DepositFilterBar exportHref="/api/merchant/transactions/deposits/export" />

      <div className="flex items-start gap-6">
        <div className="flex-1 min-w-0 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
          {rows.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-slate-50 flex items-center justify-center mb-3">
                <Landmark className="w-6 h-6 text-slate-300" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 mb-1">No deposits yet</h3>
              <p className="text-sm text-slate-500">
                Deposits to your bank account will show here as settled funds are sent.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm min-w-[1300px]">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50">
                  <th className="px-6 py-3">ID</th>
                  {visibleCols.has("created") && <th className="px-6 py-3">Created (CDT)</th>}
                  {visibleCols.has("organization") && <th className="px-6 py-3">Organization</th>}
                  {visibleCols.has("amount") && <th className="px-6 py-3 text-right">Deposit Amount</th>}
                  {visibleCols.has("bankAccount") && <th className="px-6 py-3">Bank Account</th>}
                  {visibleCols.has("state") && <th className="px-6 py-3">Deposit State</th>}
                  {visibleCols.has("fundingSpeed") && <th className="px-6 py-3">Funding Speed</th>}
                  {visibleCols.has("settlementCount") && <th className="px-6 py-3 text-right">Settlement Count</th>}
                  {visibleCols.has("paymentCount") && <th className="px-6 py-3 text-right">Payment Count</th>}
                  {visibleCols.has("netAmount") && <th className="px-6 py-3 text-right">Net Amount</th>}
                  {visibleCols.has("updated") && <th className="px-6 py-3">Updated (CDT)</th>}
                  <th className="px-6 py-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => {
                  const isSelected = id === d.finixFundingTransferAttemptId;
                  const displayState = (d.state || "").toUpperCase();
                  return (
                    <ClickableTableRow
                      key={d.id}
                      id={d.finixFundingTransferAttemptId}
                      className={`border-t border-slate-50 hover:bg-slate-50 ${isSelected ? "bg-slate-50" : ""}`}
                    >
                      <td className="px-6 py-3">
                        <CopyableIdBadge id={d.finixFundingTransferAttemptId} />
                      </td>
                      {visibleCols.has("created") && (
                        <td className="px-6 py-3">
                          <StackedDateTime date={d.createdAtFinix} />
                        </td>
                      )}
                      {visibleCols.has("organization") && (
                        <td className="px-6 py-3 text-slate-700">{church?.name || "—"}</td>
                      )}
                      {visibleCols.has("amount") && (
                        <td className="px-6 py-3 text-right">
                          <span className="font-bold text-slate-900">{formatCents(d.amountCents ?? 0)}</span>{" "}
                          <span className="text-xs text-slate-400">{d.currency || "USD"}</span>
                        </td>
                      )}
                      {visibleCols.has("bankAccount") && (
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-2">
                            <Landmark className="w-4 h-4 text-slate-400 shrink-0" />
                            <div>
                              <p className="text-slate-700">
                                {d.bankName ? `${d.bankName} ` : ""}••••{d.bankAccountLast4 || "----"}
                              </p>
                              {d.accountHolderName && (
                                <p className="text-xs text-slate-400">{d.accountHolderName}</p>
                              )}
                            </div>
                          </div>
                        </td>
                      )}
                      {visibleCols.has("state") && (
                        <td className="px-6 py-3">
                          <StateBadge state={displayState} />
                          {d.failureCode && <p className="text-xs text-red-500 mt-0.5">{d.failureCode}</p>}
                        </td>
                      )}
                      {visibleCols.has("fundingSpeed") && (
                        <td className="px-6 py-3 text-slate-700">{formatFundingSpeed(d.fundingSpeed)}</td>
                      )}
                      {visibleCols.has("settlementCount") && (
                        <td className="px-6 py-3 text-right text-slate-700">
                          {d.settlementCount ?? (d.finixSettlementId ? 1 : 0)}
                        </td>
                      )}
                      {visibleCols.has("paymentCount") && (
                        <td className="px-6 py-3 text-right text-slate-700">{d.paymentCount ?? "—"}</td>
                      )}
                      {visibleCols.has("netAmount") && (
                        <td className="px-6 py-3 text-right">
                          <span className="font-bold text-slate-900">
                            {formatCents(d.netAmountCents ?? d.amountCents ?? 0)}
                          </span>{" "}
                          <span className="text-xs text-slate-400">{d.currency || "USD"}</span>
                        </td>
                      )}
                      {visibleCols.has("updated") && (
                        <td className="px-6 py-3">
                          <StackedDateTime date={d.updatedAtFinix} />
                        </td>
                      )}
                      <td className="px-6 py-3">
                        <DepositRowActions depositId={d.finixFundingTransferAttemptId} settlementId={d.finixSettlementId} />
                      </td>
                    </ClickableTableRow>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {id && <DepositDetailPanel depositId={id} churchId={churchId} />}
      </div>
    </div>
  );
}
