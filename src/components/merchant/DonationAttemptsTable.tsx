import ClickableTableRow from "@/components/merchant/ClickableTableRow";
import CopyableIdBadge from "@/components/merchant/CopyableIdBadge";
import StateBadge from "@/components/merchant/StateBadge";
import PaymentDetailPanel from "@/components/merchant/PaymentDetailPanel";
import DonationAttemptsFilterBar from "@/components/merchant/DonationAttemptsFilterBar";
import { formatCents } from "@/lib/format";
import { formatDateCDT, formatTimeCDT } from "@/lib/formatDateTimeCDT";
import { formatPersonName } from "@/lib/formatPersonName";
import { resolveDateRange } from "@/lib/dateRangePresets";
import { loadGivingLinkAttempts, describeInstrumentType } from "@/lib/givingLinks/attempts";
import { describeFailureCode } from "@/lib/finix/cardDeclineReasons";

function StackedDateTime({ date }: { date: Date | null | undefined }) {
  if (!date) return <span className="text-slate-400">—</span>;
  return (
    <div className="whitespace-nowrap">
      <p className="text-slate-700">{formatDateCDT(date)}</p>
      <p className="text-xs text-slate-400">{formatTimeCDT(date)} CDT</p>
    </div>
  );
}

export default async function DonationAttemptsTable({
  churchId,
  searchParams,
  givingLinkId,
  exportHrefBase = "/api/merchant/giving-links/attempts/export",
}: {
  churchId: string;
  searchParams: Record<string, string | undefined>;
  givingLinkId?: string;
  exportHrefBase?: string;
}) {
  const { state, linkName, donor: donorFilter, amount, range, from, to, id } = searchParams;
  const { from: startDate, to: endDate } = resolveDateRange(range, from, to);
  const dateFilter = startDate ? { gte: startDate, ...(endDate ? { lte: endDate } : {}) } : undefined;

  const allRows = await loadGivingLinkAttempts(churchId, { givingLinkId, dateFilter, take: 300 });

  const rows = allRows.filter(({ payment, transfer, instrument, donor, givingLink }) => {
    const displayState = (payment.status === "RETURNED" ? "RETURNED" : transfer?.state || payment.status || "").toUpperCase();
    if (state && displayState !== state) return false;
    if (linkName && !(givingLink?.internalName || "").toLowerCase().includes(linkName.toLowerCase())) return false;
    if (donorFilter) {
      const name = donor?.name || instrument?.accountHolderName || "";
      if (!name.toLowerCase().includes(donorFilter.toLowerCase())) return false;
    }
    if (amount) {
      const cents = Math.round(parseFloat(amount) * 100);
      if (!Number.isNaN(cents) && payment.amountCents !== cents) return false;
    }
    return true;
  });

  const exportHref = givingLinkId ? `${exportHrefBase}?givingLinkId=${givingLinkId}` : exportHrefBase;

  return (
    <>
      <DonationAttemptsFilterBar exportHref={exportHref} showGivingLinkFilter={!givingLinkId} />

      <div className="flex items-start gap-6">
        <div className="flex-1 min-w-0 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
          {rows.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <h3 className="text-sm font-bold text-slate-900 mb-1">No donation attempts</h3>
              <p className="text-sm text-slate-500">
                Donation attempts made through {givingLinkId ? "this giving link" : "your giving links"} will appear here.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm min-w-[1300px]">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50">
                  <th className="px-6 py-3">ID</th>
                  <th className="px-6 py-3">Created (CDT)</th>
                  {!givingLinkId && <th className="px-6 py-3">Giving Link Name</th>}
                  <th className="px-6 py-3">Transaction Type</th>
                  <th className="px-6 py-3">Donor</th>
                  <th className="px-6 py-3 text-right">Amount</th>
                  <th className="px-6 py-3">State</th>
                  <th className="px-6 py-3">Failure / Reason</th>
                  <th className="px-6 py-3">Payment Instrument</th>
                  <th className="px-6 py-3">Instrument Type</th>
                  <th className="px-6 py-3">Updated (CDT)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ payment, givingLink, transfer, instrument, donor }) => {
                  const displayState = (payment.status === "RETURNED" ? "RETURNED" : transfer?.state || payment.status || "").toUpperCase();
                  const isSelected = id === payment.finixTransferId;

                  return (
                    <ClickableTableRow
                      key={payment.id}
                      id={payment.finixTransferId || payment.id}
                      className={`border-t border-slate-50 hover:bg-slate-50 ${isSelected ? "bg-slate-50" : ""}`}
                    >
                      <td className="px-6 py-3">
                        {payment.finixTransferId ? <CopyableIdBadge id={payment.finixTransferId} /> : "—"}
                      </td>
                      <td className="px-6 py-3">
                        <StackedDateTime date={payment.createdAt} />
                      </td>
                      {!givingLinkId && (
                        <td className="px-6 py-3 text-slate-700">{givingLink?.internalName || "—"}</td>
                      )}
                      <td className="px-6 py-3 text-slate-700">Donation</td>
                      <td className="px-6 py-3">
                        <p className="text-slate-800 font-medium">
                          {payment.isAnonymous ? "Anonymous" : formatPersonName(donor?.name, instrument?.accountHolderName)}
                        </p>
                        {!payment.isAnonymous && donor?.email && <p className="text-xs text-slate-400">{donor.email}</p>}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <span className="font-bold text-slate-900">{formatCents(payment.amountCents)}</span>{" "}
                        <span className="text-xs text-slate-400">USD</span>
                      </td>
                      <td className="px-6 py-3">
                        <StateBadge state={displayState} />
                      </td>
                      <td className="px-6 py-3 text-slate-600">
                        {transfer?.failureCode ? describeFailureCode(transfer.failureCode) : "—"}
                      </td>
                      <td className="px-6 py-3">
                        <p className="text-slate-700">
                          {instrument?.cardBrand || (instrument?.bankLast4 ? "Bank" : "—")} ••••
                          {instrument?.cardLast4 || instrument?.bankLast4 || "----"}
                        </p>
                        {instrument?.accountHolderName && (
                          <p className="text-xs text-slate-400">{instrument.accountHolderName}</p>
                        )}
                      </td>
                      <td className="px-6 py-3 text-slate-700">{describeInstrumentType(payment.paymentMethodType)}</td>
                      <td className="px-6 py-3">
                        <StackedDateTime date={payment.updatedAt} />
                      </td>
                    </ClickableTableRow>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {id && <PaymentDetailPanel transferId={id} churchId={churchId} />}
      </div>
    </>
  );
}
