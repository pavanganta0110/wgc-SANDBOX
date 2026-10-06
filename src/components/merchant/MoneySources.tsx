import Link from "next/link";
import { formatCents } from "@/lib/format";
import { formatDateTimeCDT } from "@/lib/formatDateTimeCDT";
import ExpandableTableRow from "@/components/merchant/ExpandableTableRow";
import { TRANSACTIONS_PER_ROW, type WhereMoneyCameFrom, type MoneyRowBase, type SourceTransaction, type EventAttendeeInfo } from "@/lib/reports/moneySources";

/**
 * "Where your donations came from" — Transaction Insights, Payments tab.
 * Server component: pure presentation of getWhereMoneyCameFrom's result.
 * Amounts are gross processed volume (same basis as the summary cards).
 */

const num = "tabular-nums";

function Bar({ percent, color }: { percent: number; color: string }) {
  return (
    <div className="h-1.5 w-full min-w-[56px] rounded-full bg-slate-100 overflow-hidden" aria-hidden>
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(2, Math.min(100, percent))}%` }} />
    </div>
  );
}

function ViewLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="text-xs font-semibold text-blue-600 hover:underline whitespace-nowrap" aria-label={`View ${label}`}>
      View
    </Link>
  );
}

function SummaryCard({
  title,
  totalCents,
  donors,
  accent,
}: {
  title: string;
  totalCents: number;
  donors: number;
  accent: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 relative overflow-hidden">
      <span className={`absolute left-0 top-0 h-full w-1 ${accent}`} aria-hidden />
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{title}</p>
      <p className={`mt-1 text-2xl font-bold text-slate-900 ${num}`}>{formatCents(totalCents)}</p>
      <p className={`text-xs text-slate-400 ${num}`}>
        {donors} donor{donors === 1 ? "" : "s"}
      </p>
    </div>
  );
}

function SectionShell({
  title,
  totalCents,
  subtitle,
  emptyText,
  isEmpty,
  children,
}: {
  title: string;
  totalCents: number;
  subtitle?: string;
  emptyText: string;
  isEmpty: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="flex items-baseline justify-between gap-4 px-5 sm:px-6 py-4 border-b border-slate-100">
        <div>
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        <p className={`text-lg font-bold text-slate-900 ${num}`}>{formatCents(totalCents)}</p>
      </div>
      {isEmpty ? <p className="px-6 py-10 text-center text-sm text-slate-400">{emptyText}</p> : children}
    </section>
  );
}

const th = "px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap";
const td = `px-4 py-3 text-sm text-slate-700 ${num}`;

function NameCell({ row, color }: { row: MoneyRowBase; color: string }) {
  return (
    <td className="px-4 py-3 text-sm font-medium text-slate-900 min-w-[180px]">
      <p className="truncate max-w-[280px]">{row.name}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <Bar percent={row.sharePercent} color={color} />
        <span className={`text-[11px] text-slate-400 w-9 text-right ${num}`}>{Math.round(row.sharePercent)}%</span>
      </div>
    </td>
  );
}

function donorLabel(t: SourceTransaction) {
  return t.donorName || "Guest donor";
}

/** Who paid: the latest payments behind one row, newest first. */
function WhoPaid({ transactions, total, label }: { transactions: SourceTransaction[]; total: number; label: string }) {
  if (transactions.length === 0) {
    return <p className="text-sm text-slate-400">No processed payments to show for {label}.</p>;
  }
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Who paid</p>
      <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white">
        <table className="w-full text-left">
          <thead className="bg-slate-50">
            <tr>
              <th className={th}>Donor</th>
              <th className={th}>Date</th>
              <th className={`${th} text-right`}>Amount</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr key={t.transferId} className="border-t border-slate-50">
                <td className="px-4 py-2 text-sm text-slate-900">
                  {t.donorId ? (
                    <Link href={`/merchant/donors/${t.donorId}`} className="hover:underline">
                      {donorLabel(t)}
                    </Link>
                  ) : (
                    <span className="text-slate-500">{donorLabel(t)}</span>
                  )}
                  {t.isAnonymous && (
                    <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                      Gave anonymously
                    </span>
                  )}
                </td>
                <td className={`px-4 py-2 text-sm text-slate-500 whitespace-nowrap ${num}`}>
                  {t.createdAt ? formatDateTimeCDT(t.createdAt) : "—"}
                </td>
                <td className={`px-4 py-2 text-sm font-semibold text-slate-900 text-right ${num}`}>
                  {formatCents(t.amountCents)}
                </td>
                <td className="px-4 py-2 text-right">
                  <Link
                    href={`/merchant/transactions/payments?id=${encodeURIComponent(t.transferId)}`}
                    className="text-xs font-semibold text-blue-600 hover:underline whitespace-nowrap"
                  >
                    Details
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > transactions.length && (
        <p className="mt-2 text-xs text-slate-400">
          Showing the latest {transactions.length} of {total} payments (up to {TRANSACTIONS_PER_ROW} per row).
        </p>
      )}
    </div>
  );
}

const PAID_VIA_LABEL: Record<EventAttendeeInfo["paidVia"], string> = {
  CARD: "Online / card",
  CASH: "Cash at door",
  CHECK: "Check at door",
  FREE: "Free registration",
  COMPLIMENTARY: "Complimentary",
};

/** Named guests for an event: who is attending, who bought the ticket, how it was paid. */
function Attendees({ attendees }: { attendees: EventAttendeeInfo[] }) {
  if (attendees.length === 0) return null;
  return (
    <div className="mt-5">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
        Attendees <span className="font-normal normal-case text-slate-400">({attendees.length})</span>
      </p>
      <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white">
        <table className="w-full text-left">
          <thead className="bg-slate-50">
            <tr>
              <th className={th}>Attendee</th>
              <th className={th}>Ticket bought by</th>
              <th className={th}>Paid</th>
              <th className={th}>Checked in</th>
            </tr>
          </thead>
          <tbody>
            {attendees.map((a) => (
              <tr key={a.id} className="border-t border-slate-50">
                <td className="px-4 py-2 text-sm font-medium text-slate-900">{a.name}</td>
                <td className="px-4 py-2 text-sm text-slate-500">
                  {a.registrantName.toLowerCase() === a.name.toLowerCase() ? "Self" : a.registrantName}
                </td>
                <td className="px-4 py-2 text-sm text-slate-500">
                  {PAID_VIA_LABEL[a.paidVia]}
                </td>
                <td className="px-4 py-2 text-sm">
                  {a.checkedIn ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Yes</span>
                  ) : (
                    <span className="text-slate-400">No</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function pct(n: number | null) {
  return n == null ? "—" : `${Math.round(n)}%`;
}

export default function MoneySources({ data }: { data: WhereMoneyCameFrom }) {
  const { givingPages, events, campaigns, pledges, other, totalCents } = data;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-bold text-slate-900">
          Where your donations came from{" "}
          <span className="font-normal text-slate-400">gross processed donations, before refunds</span>
        </p>
        <p className={`text-sm text-slate-500 ${num}`}>
          Total <span className="font-bold text-slate-900">{formatCents(totalCents)}</span>
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard title="Giving pages" totalCents={givingPages.totalCents} donors={givingPages.donors} accent="bg-blue-500" />
        <SummaryCard title="Events" totalCents={events.totalCents} donors={events.donors} accent="bg-violet-500" />
        <SummaryCard title="Campaigns" totalCents={campaigns.totalCents} donors={campaigns.donors} accent="bg-emerald-500" />
        <SummaryCard title="Pledges" totalCents={pledges.totalCents} donors={pledges.donors} accent="bg-amber-500" />
      </div>

      <SectionShell
        title="Giving Pages"
        totalCents={givingPages.totalCents}
        emptyText="No giving page payments in this date range"
        isEmpty={givingPages.rows.length === 0}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50">
              <tr>
                <th className="w-6" /><th className={th}>Page</th>
                <th className={`${th} text-right`}>Raised</th>
                <th className={`${th} text-right`}>Donors</th>
                <th className={`${th} text-right`}>Gifts</th>
                <th className={`${th} text-right`}>Avg. gift</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {givingPages.rows.map((r) => (
                <ExpandableTableRow key={r.id} label={r.name} colSpan={6} detail={<WhoPaid transactions={r.transactions} total={r.payments} label={r.name} />}>
                  <NameCell row={r} color="bg-blue-500" />
                  <td className={`${td} text-right font-semibold text-slate-900`}>{formatCents(r.amountCents)}</td>
                  <td className={`${td} text-right`}>{r.donors}</td>
                  <td className={`${td} text-right`}>{r.payments}</td>
                  <td className={`${td} text-right`}>{formatCents(r.averageGiftCents)}</td>
                  <td className="px-4 py-3 text-right"><ViewLink href={r.href} label={r.name} /></td>
                </ExpandableTableRow>
              ))}
            </tbody>
          </table>
        </div>
      </SectionShell>

      <SectionShell
        title="Events"
        totalCents={events.totalCents}
        subtitle={
          events.offlineCents > 0
            ? `Plus ${formatCents(events.offlineCents)} door cash/check — offline, not included in processed totals`
            : undefined
        }
        emptyText="No events in this date range"
        isEmpty={events.rows.length === 0}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50">
              <tr>
                <th className="w-6" /><th className={th}>Event</th>
                <th className={`${th} text-right`}>Revenue</th>
                <th className={`${th} text-right`}>Paid registrations</th>
                <th className={`${th} text-right`}>Attendees</th>
                <th className={`${th} text-right`}>Paying donors</th>
                <th className={`${th} text-right`}>Door cash/check</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {events.rows.map((r) => (
                <ExpandableTableRow key={r.id} label={r.name} colSpan={7} detail={
                    <>
                      <WhoPaid transactions={r.transactions} total={r.payments} label={r.name} />
                      <Attendees attendees={r.attendeeList} />
                    </>
                  }>
                  <NameCell row={r} color="bg-violet-500" />
                  <td className={`${td} text-right font-semibold text-slate-900`}>{formatCents(r.amountCents)}</td>
                  <td className={`${td} text-right`}>{r.registrations}</td>
                  <td className={`${td} text-right`}>{r.attendees}</td>
                  <td className={`${td} text-right`}>{r.donors}</td>
                  <td className={`${td} text-right text-slate-500`}>
                    {r.offlineCents > 0 ? `${formatCents(r.offlineCents)} (${r.offlineRegistrations})` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right"><ViewLink href={r.href} label={r.name} /></td>
                </ExpandableTableRow>
              ))}
            </tbody>
          </table>
        </div>
      </SectionShell>

      <SectionShell
        title="Fundraising Campaigns"
        totalCents={campaigns.totalCents}
        subtitle="Raised is this date range. Goal progress is all-time, matching each campaign's page."
        emptyText="No campaign payments in this date range"
        isEmpty={campaigns.rows.length === 0}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50">
              <tr>
                <th className="w-6" /><th className={th}>Campaign</th>
                <th className={`${th} text-right`}>Raised (range)</th>
                <th className={`${th} text-right`}>Donors</th>
                <th className={`${th} text-right`}>Goal</th>
                <th className={`${th} text-right`}>All-time raised</th>
                <th className={`${th} text-right`}>% of goal</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {campaigns.rows.map((r) => (
                <ExpandableTableRow key={r.id} label={r.name} colSpan={8} detail={<WhoPaid transactions={r.transactions} total={r.payments} label={r.name} />}>
                  <NameCell row={r} color="bg-emerald-500" />
                  <td className={`${td} text-right font-semibold text-slate-900`}>{formatCents(r.amountCents)}</td>
                  <td className={`${td} text-right`}>{r.donors}</td>
                  <td className={`${td} text-right`}>{r.goalAmountCents ? formatCents(r.goalAmountCents) : "—"}</td>
                  <td className={`${td} text-right`}>{formatCents(r.lifetimeRaisedCents)}</td>
                  <td className={`${td} text-right`}>{pct(r.percentOfGoal)}</td>
                  <td className="px-4 py-3 text-right"><ViewLink href={r.href} label={r.name} /></td>
                </ExpandableTableRow>
              ))}
            </tbody>
          </table>
        </div>
      </SectionShell>

      <SectionShell
        title="Pledges"
        totalCents={pledges.totalCents}
        subtitle="Paid is this date range. Pledged and fulfilment are all-time, including linked external donations."
        emptyText="No pledge payments in this date range"
        isEmpty={pledges.rows.length === 0}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50">
              <tr>
                <th className="w-6" /><th className={th}>Pledge campaign</th>
                <th className={`${th} text-right`}>Paid (range)</th>
                <th className={`${th} text-right`}>Pledged</th>
                <th className={`${th} text-right`}>Fulfilled</th>
                <th className={`${th} text-right`}>Pledgers</th>
                <th className={`${th} text-right`}>Have paid</th>
                <th className={`${th} text-right`}>Fulfilment</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {pledges.rows.map((r) => (
                <ExpandableTableRow key={r.id} label={r.name} colSpan={8} detail={<WhoPaid transactions={r.transactions} total={r.payments} label={r.name} />}>
                  <NameCell row={r} color="bg-amber-500" />
                  <td className={`${td} text-right font-semibold text-slate-900`}>{formatCents(r.amountCents)}</td>
                  <td className={`${td} text-right`}>{formatCents(r.pledgedCents)}</td>
                  <td className={`${td} text-right`}>{formatCents(r.fulfilledCents)}</td>
                  <td className={`${td} text-right`}>{r.pledgersCount}</td>
                  <td className={`${td} text-right`}>{r.payersCount}</td>
                  <td className={`${td} text-right`}>{pct(r.fulfilledPercent)}</td>
                  <td className="px-4 py-3 text-right"><ViewLink href={r.href} label={r.name} /></td>
                </ExpandableTableRow>
              ))}
            </tbody>
          </table>
        </div>
      </SectionShell>

      {(other.payments > 0 || other.totalCents > 0) && (
        <details className="group rounded-2xl border border-dashed border-slate-200 bg-slate-50">
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3">
            <p className="text-sm text-slate-600">
              Unattributed / other
              <span className="block text-xs text-slate-400">
                Take a Payment, invoices and anything not tied to a page, event, campaign or pledge — click to see who paid
              </span>
            </p>
            <p className={`text-sm font-semibold text-slate-900 text-right ${num}`}>
              {formatCents(other.totalCents)}
              <span className="block text-xs font-normal text-slate-400">
                {other.payments} payment{other.payments === 1 ? "" : "s"}
              </span>
            </p>
          </summary>
          <div className="px-5 pb-4">
            <WhoPaid transactions={other.transactions} total={other.payments} label="unattributed payments" />
          </div>
        </details>
      )}
    </div>
  );
}
