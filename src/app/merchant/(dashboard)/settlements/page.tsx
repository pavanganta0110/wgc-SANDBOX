import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpDown, Landmark } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { getSettlementPermissions } from "@/lib/finix/settlementPermissions";
import { formatCents, formatSignedCents } from "@/lib/format";
import { resolveDateRange } from "@/lib/dateRangePresets";
import CopyableIdBadge from "@/components/merchant/CopyableIdBadge";
import ClickableTableRow from "@/components/merchant/ClickableTableRow";
import StateBadge from "@/components/merchant/StateBadge";
import SettlementDetailPanel from "@/components/merchant/SettlementDetailPanel";
import SettlementsFilterBar from "@/components/merchant/SettlementsFilterBar";
import Pagination from "@/components/merchant/Pagination";
import { formatDateCDT, formatTimeCDT } from "@/lib/formatDateTimeCDT";
import { loadSettlementsList, type SettlementsListSort } from "@/lib/finix/settlementsList";
import { parseVisibleSettlementColumns } from "@/lib/settlementColumns";
import { resolveSettlementDisplayStatus } from "@/lib/finix/settlementStatus";
import { PinButton } from "@/components/merchant/PaymentDetailActions";

const PAGE_SIZE = 25;

function StackedDateTime({ date }: { date: Date | null | undefined }) {
  if (!date) return <span className="text-slate-400">—</span>;
  return (
    <div className="whitespace-nowrap">
      <p className="text-slate-700">{formatDateCDT(date)}</p>
      <p className="text-xs text-slate-400">{formatTimeCDT(date)} CDT</p>
    </div>
  );
}

export default async function SettlementsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    depositStatus?: string;
    reconciliationStatus?: string;
    minGross?: string;
    maxGross?: string;
    traceId?: string;
    range?: string;
    from?: string;
    to?: string;
    cols?: string;
    sort?: string;
    page?: string;
    id?: string;
  }>;
}) {
  const session = await getSession();
  // Team-access Checkpoint 4: settlements are organization-level financial
  // information — OWNER always, ADMIN only with canViewSettlements,
  // FUNDRAISER/VIEWER denied per the approved policy. Previously this page
  // had no role gate at all beyond the coarse middleware session check, so
  // any authenticated org member — including FUNDRAISER/VIEWER — could load
  // full settlement data. Redirecting before any data fetch closes that gap
  // without needing a new access-denied UI component.
  if (!session?.churchId || !getSettlementPermissions(session.role).canView) {
    redirect("/merchant/dashboard");
  }
  const churchId = session.churchId;
  const sp = await searchParams;
  const { from: startDate, to: endDate } = resolveDateRange(sp.range, sp.from, sp.to);
  const dateFilter = startDate ? { gte: startDate, ...(endDate ? { lte: endDate } : {}) } : undefined;
  const visibleCols = parseVisibleSettlementColumns(sp.cols);

  const minGrossCents = sp.minGross ? Math.round(parseFloat(sp.minGross) * 100) : undefined;
  const maxGrossCents = sp.maxGross ? Math.round(parseFloat(sp.maxGross) * 100) : undefined;

  const [sortKey, sortDir] = (sp.sort || "createdAtFinix:desc").split(":") as [SettlementsListSort["key"], "asc" | "desc"];
  const page = Math.max(1, parseInt(sp.page || "1", 10) || 1);

  const { rows, totalCount } = await loadSettlementsList(
    churchId,
    {
      dateFilter,
      status: sp.status || undefined,
      depositStatus: sp.depositStatus === "linked" || sp.depositStatus === "unlinked" ? sp.depositStatus : undefined,
      reconciliationStatus: sp.reconciliationStatus || undefined,
      minGrossCents: Number.isNaN(minGrossCents) ? undefined : minGrossCents,
      maxGrossCents: Number.isNaN(maxGrossCents) ? undefined : maxGrossCents,
      traceId: sp.traceId || undefined,
    },
    { key: sortKey, dir: sortDir },
    page,
    PAGE_SIZE,
  );

  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const sortLink = (key: string) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && k !== "sort" && k !== "page") params.set(k, v);
    const nextDir = sortKey === key && sortDir === "desc" ? "asc" : "desc";
    params.set("sort", `${key}:${nextDir}`);
    return `?${params.toString()}`;
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-lg font-bold text-slate-900">Settlements</h2>
        <PinButton />
      </div>

      <SettlementsFilterBar exportHref="/api/merchant/transactions/settlements/export" />

      <div className="flex items-start gap-6">
        <div className="flex-1 min-w-0 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
          {rows.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-slate-50 flex items-center justify-center mb-3">
                <Landmark className="w-6 h-6 text-slate-300" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 mb-1">No settlements</h3>
              <p className="text-sm text-slate-500 max-w-sm mx-auto">
                Settlement activity will appear here as payments, fees, refunds, returns, and disputes are grouped
                for funding.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm min-w-[1500px]">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50">
                  {visibleCols.has("id") && <th className="px-6 py-3">ID</th>}
                  {visibleCols.has("created") && (
                    <th className="px-6 py-3">
                      <Link href={sortLink("createdAtFinix")} className="flex items-center gap-1 hover:text-slate-800">
                        Created (CDT) <ArrowUpDown className="w-3 h-3" />
                      </Link>
                    </th>
                  )}
                  {visibleCols.has("status") && <th className="px-6 py-3">Status</th>}
                  {visibleCols.has("grossAmount") && (
                    <th className="px-6 py-3 text-right">
                      <Link href={sortLink("totalAmountCents")} className="flex items-center justify-end gap-1 hover:text-slate-800">
                        Gross Amount <ArrowUpDown className="w-3 h-3" />
                      </Link>
                    </th>
                  )}
                  {visibleCols.has("feeAmount") && (
                    <th className="px-6 py-3 text-right">
                      <Link href={sortLink("feeAmountCents")} className="flex items-center justify-end gap-1 hover:text-slate-800">
                        Fee Amount <ArrowUpDown className="w-3 h-3" />
                      </Link>
                    </th>
                  )}
                  {visibleCols.has("refundAmount") && <th className="px-6 py-3 text-right">Refund Amount</th>}
                  {visibleCols.has("returnAmount") && <th className="px-6 py-3 text-right">Return Amount</th>}
                  {visibleCols.has("disputeAmount") && (
                    <th className="px-6 py-3 text-right">
                      <Link href={sortLink("disputeAmountCents")} className="flex items-center justify-end gap-1 hover:text-slate-800">
                        Dispute Amount <ArrowUpDown className="w-3 h-3" />
                      </Link>
                    </th>
                  )}
                  {visibleCols.has("otherAdjustmentAmount") && <th className="px-6 py-3 text-right">Other Adjustments</th>}
                  {visibleCols.has("netAmount") && (
                    <th className="px-6 py-3 text-right">
                      <Link href={sortLink("netAmountCents")} className="flex items-center justify-end gap-1 hover:text-slate-800">
                        Net Amount <ArrowUpDown className="w-3 h-3" />
                      </Link>
                    </th>
                  )}
                  {visibleCols.has("transactionCount") && <th className="px-6 py-3 text-right">Transactions</th>}
                  {visibleCols.has("depositStatus") && <th className="px-6 py-3">Deposit Status</th>}
                  {visibleCols.has("depositId") && <th className="px-6 py-3">Deposit ID</th>}
                  {visibleCols.has("reconciliationStatus") && <th className="px-6 py-3">Reconciliation</th>}
                  {visibleCols.has("traceId") && <th className="px-6 py-3">Trace ID</th>}
                  <th className="px-6 py-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ settlement, deposit }) => {
                  const displayStatus = resolveSettlementDisplayStatus(settlement);
                  const isSelected = sp.id === settlement.finixSettlementId;
                  return (
                    <ClickableTableRow
                      key={settlement.id}
                      id={settlement.finixSettlementId}
                      className={`border-t border-slate-50 hover:bg-slate-50 ${isSelected ? "bg-slate-50" : ""}`}
                    >
                      {visibleCols.has("id") && (
                        <td className="px-6 py-3">
                          <CopyableIdBadge id={settlement.finixSettlementId} />
                        </td>
                      )}
                      {visibleCols.has("created") && (
                        <td className="px-6 py-3"><StackedDateTime date={settlement.createdAtFinix} /></td>
                      )}
                      {visibleCols.has("status") && (
                        <td className="px-6 py-3">
                          <StateBadge state={displayStatus} />
                        </td>
                      )}
                      {visibleCols.has("grossAmount") && (
                        <td className="px-6 py-3 text-right font-semibold text-slate-900">
                          {formatCents(settlement.totalAmountCents ?? 0)}
                        </td>
                      )}
                      {visibleCols.has("feeAmount") && (
                        <td className="px-6 py-3 text-right text-slate-600">
                          {formatSignedCents(-(settlement.feeAmountCents ?? 0))}
                        </td>
                      )}
                      {visibleCols.has("refundAmount") && (
                        <td className="px-6 py-3 text-right text-slate-600">
                          {formatSignedCents(-(settlement.refundAmountCents ?? 0))}
                        </td>
                      )}
                      {visibleCols.has("returnAmount") && (
                        <td className="px-6 py-3 text-right text-slate-600">
                          {formatSignedCents(-(settlement.returnAmountCents ?? 0))}
                        </td>
                      )}
                      {visibleCols.has("disputeAmount") && (
                        <td className="px-6 py-3 text-right text-slate-600">
                          {formatSignedCents(-(settlement.disputeAmountCents ?? 0))}
                        </td>
                      )}
                      {visibleCols.has("otherAdjustmentAmount") && (
                        <td className="px-6 py-3 text-right text-slate-600">
                          {settlement.otherAdjustmentAmountCents != null
                            ? formatSignedCents(settlement.otherAdjustmentAmountCents)
                            : "—"}
                        </td>
                      )}
                      {visibleCols.has("netAmount") && (
                        <td className="px-6 py-3 text-right font-semibold text-slate-900">
                          {formatCents(settlement.netAmountCents ?? 0)}
                        </td>
                      )}
                      {visibleCols.has("transactionCount") && (
                        <td className="px-6 py-3 text-right text-slate-600">{settlement.transactionCount ?? 0}</td>
                      )}
                      {visibleCols.has("depositStatus") && (
                        <td className="px-6 py-3">
                          {deposit ? <StateBadge state={deposit.state} /> : <span className="text-slate-400">Not Yet Linked</span>}
                        </td>
                      )}
                      {visibleCols.has("depositId") && (
                        <td className="px-6 py-3">
                          {deposit ? <CopyableIdBadge id={deposit.finixFundingTransferAttemptId} /> : <span className="text-slate-400">—</span>}
                        </td>
                      )}
                      {visibleCols.has("reconciliationStatus") && (
                        <td className="px-6 py-3">
                          <StateBadge state={settlement.reconciliationStatus} />
                        </td>
                      )}
                      {visibleCols.has("traceId") && (
                        <td className="px-6 py-3 text-slate-500">{settlement.traceId || "—"}</td>
                      )}
                      <td className="px-6 py-3" />
                    </ClickableTableRow>
                  );
                })}
              </tbody>
            </table>
          )}
          {rows.length > 0 && <Pagination page={page} pageCount={pageCount} total={totalCount} pageSize={PAGE_SIZE} />}
        </div>
        {sp.id && <SettlementDetailPanel settlementId={sp.id} churchId={churchId} />}
      </div>
    </div>
  );
}
