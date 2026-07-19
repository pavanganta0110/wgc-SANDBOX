import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpDown, ShieldAlert } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getDisputePermissions } from "@/lib/finix/disputePermissions";
import { formatCents } from "@/lib/format";
import { resolveDateRange } from "@/lib/dateRangePresets";
import CopyableIdBadge from "@/components/merchant/CopyableIdBadge";
import ClickableTableRow from "@/components/merchant/ClickableTableRow";
import StateBadge from "@/components/merchant/StateBadge";
import DisputeDetailPanel from "@/components/merchant/DisputeDetailPanel";
import DisputesTabs from "@/components/merchant/DisputesTabs";
import DisputesFilterBar from "@/components/merchant/DisputesFilterBar";
import { formatPersonName } from "@/lib/formatPersonName";
import { formatDateCDT, formatTimeCDT } from "@/lib/formatDateTimeCDT";
import { titleCaseFromSnake as titleCase } from "@/lib/finix/displayFormatters";
import { loadDisputesList } from "@/lib/finix/disputesList";
import { parseVisibleDisputeColumns } from "@/lib/disputeColumns";
import {
  resolveDisputeDisplayStatus,
  resolveDisputeNeedsAttention,
  DISPUTE_DISPLAY_STATUS_LABELS,
} from "@/lib/finix/disputeStatus";
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

export default async function DisputesPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    status?: string;
    responseStatus?: string;
    reason?: string;
    amount?: string;
    donor?: string;
    paymentMethod?: string;
    overdue?: string;
    settlement?: string;
    deposit?: string;
    range?: string;
    from?: string;
    to?: string;
    cols?: string;
    sort?: string;
    id?: string;
  }>;
}) {
  const session = await getSession();
  // Team-access Checkpoint 4A: previously had no role gate at all beyond
  // middleware — every authenticated org member saw every dispute
  // org-wide. Disputes have no row-level attribution wired yet, so
  // FUNDRAISER/VIEWER are denied entirely per the approved fallback policy.
  if (!session?.churchId || !getDisputePermissions(session.role).canView) {
    redirect("/merchant/dashboard");
  }
  const churchId = session.churchId;
  const sp = await searchParams;
  const tab = sp.tab === "needs_attention" ? "needs_attention" : "all";
  const { from: startDate, to: endDate } = resolveDateRange(sp.range, sp.from, sp.to);
  const dateFilter = startDate ? { gte: startDate, ...(endDate ? { lte: endDate } : {}) } : undefined;
  const visibleCols = parseVisibleDisputeColumns(sp.cols);

  const allRows = await loadDisputesList(churchId, dateFilter);

  const withMeta = allRows.map((row) => {
    const displayStatus = resolveDisputeDisplayStatus(row.dispute);
    const needsAttention = resolveDisputeNeedsAttention({ ...row.dispute });
    return { ...row, displayStatus, needsAttention: needsAttention.needsAttention };
  });

  const allCount = withMeta.length;
  const needsAttentionCount = withMeta.filter((r) => r.needsAttention).length;

  let rows = tab === "needs_attention" ? withMeta.filter((r) => r.needsAttention) : withMeta;

  rows = rows.filter(({ dispute, transfer, instrument, donor, displayStatus, settlement, deposit }) => {
    if (sp.status && displayStatus !== sp.status) return false;
    if (sp.responseStatus === "submitted" && !dispute.respondedAt) return false;
    if (sp.responseStatus === "not_submitted" && dispute.respondedAt) return false;
    if (sp.reason && !(dispute.reason || "").toLowerCase().includes(sp.reason.toLowerCase())) return false;
    if (sp.amount) {
      const cents = Math.round(parseFloat(sp.amount) * 100);
      if (!Number.isNaN(cents) && dispute.amountCents !== cents) return false;
    }
    if (sp.donor) {
      const name = donor?.name || instrument?.accountHolderName || "";
      if (!name.toLowerCase().includes(sp.donor.toLowerCase())) return false;
    }
    if (sp.paymentMethod === "card" && !instrument?.cardLast4) return false;
    if (sp.paymentMethod === "bank" && !instrument?.bankLast4) return false;
    if (sp.overdue === "1" && displayStatus !== "EXPIRED") return false;
    if (sp.settlement && settlement?.finixSettlementId !== sp.settlement) return false;
    if (sp.deposit && deposit?.finixFundingTransferAttemptId !== sp.deposit) return false;
    return true;
  });

  const [sortKey, sortDir] = (sp.sort || "createdAtFinix:desc").split(":") as [string, "asc" | "desc"];
  rows = [...rows].sort((a, b) => {
    let av: number, bv: number;
    if (sortKey === "updatedAtFinix") {
      av = a.dispute.updatedAtFinix?.getTime() ?? 0;
      bv = b.dispute.updatedAtFinix?.getTime() ?? 0;
    } else if (sortKey === "paymentAmount") {
      av = a.transfer?.amountCents ?? 0;
      bv = b.transfer?.amountCents ?? 0;
    } else if (sortKey === "disputedAmount") {
      av = a.dispute.amountCents ?? 0;
      bv = b.dispute.amountCents ?? 0;
    } else {
      av = a.dispute.createdAtFinix?.getTime() ?? 0;
      bv = b.dispute.createdAtFinix?.getTime() ?? 0;
    }
    return sortDir === "asc" ? av - bv : bv - av;
  });

  const sortLink = (key: string) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && k !== "sort") params.set(k, v);
    const nextDir = sortKey === key && sortDir === "desc" ? "asc" : "desc";
    params.set("sort", `${key}:${nextDir}`);
    return `?${params.toString()}`;
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-lg font-bold text-slate-900">Disputes</h2>
        <PinButton />
      </div>

      <DisputesTabs active={tab} allCount={allCount} needsAttentionCount={needsAttentionCount} />

      <DisputesFilterBar exportHref="/api/merchant/transactions/disputes/export" />

      <div className="flex items-start gap-6">
        <div className="flex-1 min-w-0 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
          {rows.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-slate-50 flex items-center justify-center mb-3">
                <ShieldAlert className="w-6 h-6 text-slate-300" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 mb-1">
                {tab === "needs_attention" ? "Nothing needs attention" : "No disputes found"}
              </h3>
              <p className="text-sm text-slate-500 max-w-sm mx-auto">
                {tab === "needs_attention"
                  ? "Every dispute is either resolved or has a response already submitted."
                  : "Your organization currently has no payment disputes. Disputes will automatically appear here if donors dispute a payment."}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm min-w-[1400px]">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50">
                  <th className="px-6 py-3">ID</th>
                  {visibleCols.has("created") && (
                    <th className="px-6 py-3">
                      <Link href={sortLink("createdAtFinix")} className="flex items-center gap-1 hover:text-slate-800">
                        Created (CDT) <ArrowUpDown className="w-3 h-3" />
                      </Link>
                    </th>
                  )}
                  {visibleCols.has("updated") && (
                    <th className="px-6 py-3">
                      <Link href={sortLink("updatedAtFinix")} className="flex items-center gap-1 hover:text-slate-800">
                        Updated (CDT) <ArrowUpDown className="w-3 h-3" />
                      </Link>
                    </th>
                  )}
                  {visibleCols.has("donor") && <th className="px-6 py-3">Donor</th>}
                  {visibleCols.has("paymentAmount") && (
                    <th className="px-6 py-3 text-right">
                      <Link href={sortLink("paymentAmount")} className="flex items-center justify-end gap-1 hover:text-slate-800">
                        Payment Amount <ArrowUpDown className="w-3 h-3" />
                      </Link>
                    </th>
                  )}
                  {visibleCols.has("disputedAmount") && (
                    <th className="px-6 py-3 text-right">
                      <Link href={sortLink("disputedAmount")} className="flex items-center justify-end gap-1 hover:text-slate-800">
                        Disputed Amount <ArrowUpDown className="w-3 h-3" />
                      </Link>
                    </th>
                  )}
                  {visibleCols.has("reason") && <th className="px-6 py-3">Reason</th>}
                  {visibleCols.has("displayStatus") && <th className="px-6 py-3">Status</th>}
                  {visibleCols.has("responseStatus") && <th className="px-6 py-3">Response Status</th>}
                  {visibleCols.has("evidenceDue") && <th className="px-6 py-3">Evidence Due</th>}
                  {visibleCols.has("paymentMethod") && <th className="px-6 py-3">Payment Method</th>}
                  {visibleCols.has("lastFour") && <th className="px-6 py-3">Last Four</th>}
                  {visibleCols.has("settlement") && <th className="px-6 py-3">Settlement</th>}
                  {visibleCols.has("deposit") && <th className="px-6 py-3">Deposit</th>}
                  <th className="px-6 py-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ dispute, transfer, instrument, donor, settlement, deposit, displayStatus }) => {
                  const isSelected = sp.id === dispute.finixDisputeId;
                  return (
                    <ClickableTableRow
                      key={dispute.id}
                      id={dispute.finixDisputeId}
                      className={`border-t border-slate-50 hover:bg-slate-50 ${isSelected ? "bg-slate-50" : ""}`}
                    >
                      <td className="px-6 py-3">
                        <CopyableIdBadge id={dispute.finixDisputeId} />
                      </td>
                      {visibleCols.has("created") && (
                        <td className="px-6 py-3"><StackedDateTime date={dispute.createdAtFinix} /></td>
                      )}
                      {visibleCols.has("updated") && (
                        <td className="px-6 py-3"><StackedDateTime date={dispute.updatedAtFinix} /></td>
                      )}
                      {visibleCols.has("donor") && (
                        <td className="px-6 py-3 text-slate-700">
                          {formatPersonName(donor?.name, instrument?.accountHolderName)}
                        </td>
                      )}
                      {visibleCols.has("paymentAmount") && (
                        <td className="px-6 py-3 text-right text-slate-700">{formatCents(transfer?.amountCents ?? 0)}</td>
                      )}
                      {visibleCols.has("disputedAmount") && (
                        <td className="px-6 py-3 text-right font-semibold text-slate-900">{formatCents(dispute.amountCents ?? 0)}</td>
                      )}
                      {visibleCols.has("reason") && (
                        <td className="px-6 py-3 text-slate-600">{titleCase(dispute.reason)}</td>
                      )}
                      {visibleCols.has("displayStatus") && (
                        <td className="px-6 py-3"><StateBadge state={displayStatus} /></td>
                      )}
                      {visibleCols.has("responseStatus") && (
                        <td className="px-6 py-3 text-slate-600">{dispute.respondedAt ? "Submitted" : "Not Submitted"}</td>
                      )}
                      {visibleCols.has("evidenceDue") && (
                        <td className="px-6 py-3 text-slate-600 whitespace-nowrap">{formatDateCDT(dispute.evidenceDueAt)}</td>
                      )}
                      {visibleCols.has("paymentMethod") && (
                        <td className="px-6 py-3 text-slate-600">
                          {instrument?.cardBrand || (instrument?.bankLast4 ? "Bank Account" : "—")}
                        </td>
                      )}
                      {visibleCols.has("lastFour") && (
                        <td className="px-6 py-3 text-slate-600">{instrument?.cardLast4 || instrument?.bankLast4 || "—"}</td>
                      )}
                      {visibleCols.has("settlement") && (
                        <td className="px-6 py-3">
                          {settlement ? <CopyableIdBadge id={settlement.finixSettlementId} /> : <span className="text-slate-400">—</span>}
                        </td>
                      )}
                      {visibleCols.has("deposit") && (
                        <td className="px-6 py-3">
                          {deposit ? <CopyableIdBadge id={deposit.finixFundingTransferAttemptId} /> : <span className="text-slate-400">—</span>}
                        </td>
                      )}
                      <td className="px-6 py-3" />
                    </ClickableTableRow>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {sp.id && <DisputeDetailPanel disputeId={sp.id} churchId={churchId} />}
      </div>
    </div>
  );
}
