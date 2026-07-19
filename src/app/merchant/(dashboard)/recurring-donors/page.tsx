import Link from "next/link";
import { Users, Send } from "lucide-react";
import { redirect } from "next/navigation";
import { formatCents } from "@/lib/format";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { resolveViewScope } from "@/lib/auth/viewScope";
import { resolveScopedUserId } from "@/lib/auth/scopes";
import { isAuthError } from "@/lib/auth/errors";
import { formatDateCDT } from "@/lib/formatDateTimeCDT";
import StateBadge from "@/components/merchant/StateBadge";
import ClickableTableRow from "@/components/merchant/ClickableTableRow";
import RecurringDonorDrawer from "@/components/merchant/RecurringDonorDrawer";
import RecurringDonorsFilterBar from "@/components/merchant/RecurringDonorsFilterBar";
import Pagination from "@/components/merchant/Pagination";
import { loadRecurringDonorsList, type RecurringDonorsSortKey } from "@/lib/subscriptions/recurringDonorsList";
import { loadRecurringDonorsAnalytics } from "@/lib/subscriptions/recurringDonorsAnalytics";
import { frequencyLabel } from "@/lib/subscriptions/subscriptionStatus";

const PAGE_SIZE = 25;

function SummaryCard({ label, value, sublabel }: { label: string; value: string; sublabel?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-xl font-bold text-slate-900">{value}</p>
      {sublabel && <p className="text-xs text-slate-400 mt-0.5">{sublabel}</p>}
    </div>
  );
}

export default async function RecurringDonorsPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    status?: string;
    frequency?: string;
    minMonthly?: string;
    maxMonthly?: string;
    hasFailedPayment?: string;
    hasPastDue?: string;
    requiresAttention?: string;
    sort?: string;
    page?: string;
    id?: string;
  }>;
}) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/login");
    throw err;
  }
  const churchId = auth.churchId;
  const sp = await searchParams;

  const page = Math.max(1, parseInt(sp.page || "1", 10) || 1);
  const [sortKey, sortDir] = (sp.sort || "monthlyValue:desc").split(":") as [RecurringDonorsSortKey, "asc" | "desc"];

  const viewScope = await resolveViewScope(auth);
  const scopedUserId = resolveScopedUserId(auth, viewScope) ?? undefined;

  const [list, analytics] = await Promise.all([
    loadRecurringDonorsList(
      churchId,
      {
        search: sp.search,
        status: sp.status,
        frequency: sp.frequency,
        minMonthlyValueCents: sp.minMonthly ? Math.round(parseFloat(sp.minMonthly) * 100) : undefined,
        maxMonthlyValueCents: sp.maxMonthly ? Math.round(parseFloat(sp.maxMonthly) * 100) : undefined,
        hasFailedPayment: sp.hasFailedPayment === "1",
        hasPastDue: sp.hasPastDue === "1",
        requiresAttention: sp.requiresAttention === "1",
        attributedUserId: scopedUserId,
      },
      { key: sortKey, dir: sortDir },
      page,
      PAGE_SIZE,
    ),
    loadRecurringDonorsAnalytics(churchId, 30, scopedUserId),
  ]);

  const { rows, totalCount } = list;
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const { summary, frequencyMix, attentionList } = analytics;

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <h2 className="text-lg font-bold text-slate-900">Recurring Donors</h2>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/merchant/giving-links" className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <Send className="w-4 h-4" />
            Send Giving Link
          </Link>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <SummaryCard label="Active Recurring Donors" value={String(summary.activeRecurringDonors)} />
        <SummaryCard label="Monthly Recurring Value" value={formatCents(summary.monthlyRecurringValueCents)} />
        <SummaryCard label="Annualized Recurring Value" value={formatCents(summary.annualizedRecurringValueCents)} />
        <SummaryCard label="New Recurring Donors" value={String(summary.newRecurringDonors)} sublabel="Last 30 days" />
        <SummaryCard label="Paused Recurring Donors" value={String(summary.pausedRecurringDonors)} />
        <SummaryCard label="Past-Due Recurring Donors" value={String(summary.pastDueRecurringDonors)} />
        <SummaryCard label="Canceled Recurring Donors" value={String(summary.canceledRecurringDonors)} />
        <SummaryCard label="Failed Recurring Payments" value={String(summary.failedRecurringPayments)} />
        <SummaryCard label="Donors Requiring Attention" value={String(summary.donorsRequiringAttention)} />
        <SummaryCard label="Upcoming Charges (7 Days)" value={String(summary.upcomingCharges7Days.count)} sublabel={formatCents(summary.upcomingCharges7Days.amountCents)} />
        <SummaryCard label="Upcoming Charges (30 Days)" value={String(summary.upcomingCharges30Days.count)} sublabel={formatCents(summary.upcomingCharges30Days.amountCents)} />
        <SummaryCard label="Lifetime Recurring Donations" value={formatCents(summary.lifetimeRecurringDonatedCents)} />
        {summary.unlinkedActiveSubscriptions > 0 && (
          <SummaryCard
            label="Unlinked Subscriptions"
            value={String(summary.unlinkedActiveSubscriptions)}
            sublabel="Active subscriptions needing donor matching"
          />
        )}
      </div>

      {/* Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Frequency Mix</h3>
          {frequencyMix.length === 0 ? (
            <p className="text-sm text-slate-400">No active recurring donations for this period.</p>
          ) : (
            <div className="space-y-2">
              {frequencyMix.map((f) => {
                // Real active subscriptions must never be represented as
                // "0 donors" without explanation — if none of this
                // frequency's subscriptions resolved to a donor, say so
                // explicitly instead of implying nothing exists.
                const allUnlinked = f.donorCount === 0 && f.subscriptionCount > 0;
                return (
                  <div key={f.frequency} className="text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">{f.frequency}</span>
                      <span className="text-slate-800 font-semibold">
                        {allUnlinked ? "0 linked donors" : `${f.donorCount} donor${f.donorCount === 1 ? "" : "s"}`} · {f.subscriptionCount} sub
                        {f.subscriptionCount === 1 ? "" : "s"} · {formatCents(f.monthlyValueCents)}/mo
                      </span>
                    </div>
                    {allUnlinked && (
                      <p className="text-xs text-amber-600 text-right mt-0.5">
                        {f.subscriptionCount} subscription{f.subscriptionCount === 1 ? "" : "s"} need{f.subscriptionCount === 1 ? "s" : ""} donor matching
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Donors Requiring Attention</h3>
          {attentionList.length === 0 ? (
            <div>
              <p className="text-sm font-semibold text-slate-900">No recurring donation issues</p>
              <p className="text-sm text-slate-500">No recurring donors currently require attention.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {attentionList.map((a) => (
                <Link key={a.donorId} href={`/merchant/recurring-donors/${a.donorId}`} className="block hover:bg-slate-50 -mx-2 px-2 py-1.5 rounded-lg">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-slate-800">{a.donorName}</span>
                    <span className="text-xs font-semibold text-blue-600">{a.recommendedAction}</span>
                  </div>
                  <p className="text-xs text-slate-500">{a.reasons.join(" · ")}</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <RecurringDonorsFilterBar exportHref="/api/merchant/recurring-donors/export" />

      <div className="flex items-start gap-6">
        <div className="flex-1 min-w-0 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
          {rows.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-slate-50 flex items-center justify-center mb-3">
                <Users className="w-6 h-6 text-slate-300" />
              </div>
              {summary.unlinkedActiveSubscriptions > 0 ? (
                <>
                  <h3 className="text-sm font-bold text-slate-900 mb-1">Some subscriptions need donor matching</h3>
                  <p className="text-sm text-slate-500 max-w-sm mx-auto">
                    {summary.unlinkedActiveSubscriptions} active subscription{summary.unlinkedActiveSubscriptions === 1 ? "" : "s"} could not
                    be resolved to a donor yet — check the Subscriptions page to review or manually match them.
                  </p>
                </>
              ) : (
                <>
                  <h3 className="text-sm font-bold text-slate-900 mb-1">No recurring subscriptions yet</h3>
                  <p className="text-sm text-slate-500 max-w-sm mx-auto">Donors with recurring donation schedules will appear here.</p>
                </>
              )}
            </div>
          ) : (
            <table className="w-full text-sm min-w-[1400px]">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100">
                  <th className="px-6 py-3">Donor</th>
                  <th className="px-6 py-3">Contact</th>
                  <th className="px-6 py-3">Recurring Status</th>
                  <th className="px-6 py-3 text-right">Monthly Value</th>
                  <th className="px-6 py-3 text-right">Annualized Value</th>
                  <th className="px-6 py-3 text-right">Active Subs</th>
                  <th className="px-6 py-3 text-right">Total Subs</th>
                  <th className="px-6 py-3">Frequencies</th>
                  <th className="px-6 py-3">Next Billing</th>
                  <th className="px-6 py-3">Last Payment</th>
                  <th className="px-6 py-3 text-right">Failed</th>
                  <th className="px-6 py-3 text-right">Lifetime Donated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => {
                  const isSelected = sp.id === d.donorId;
                  return (
                    <ClickableTableRow key={d.donorId} id={d.donorId} className={`border-t border-slate-50 hover:bg-slate-50 ${isSelected ? "bg-slate-50" : ""}`}>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center shrink-0">
                            {d.donorName[0] || "?"}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800">{d.donorName}</p>
                            {d.requiresAttention && <span className="text-xs text-red-600">At Risk</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-slate-600">
                        <p>{d.donorEmail || "—"}</p>
                        <p className="text-xs text-slate-400">{d.donorPhone || "—"}</p>
                      </td>
                      <td className="px-6 py-3"><StateBadge state={d.overallStatus} /></td>
                      <td className="px-6 py-3 text-right font-semibold text-slate-900">{formatCents(d.monthlyValueCents)}</td>
                      <td className="px-6 py-3 text-right text-slate-600">{formatCents(d.annualizedValueCents)}</td>
                      <td className="px-6 py-3 text-right text-slate-600">{d.activeSubscriptionCount}</td>
                      <td className="px-6 py-3 text-right text-slate-600">{d.totalSubscriptionCount}</td>
                      <td className="px-6 py-3 text-slate-600">
                        {d.frequencies.length === 0 ? "—" : `${frequencyLabel(d.frequencies[0])}${d.frequencies.length > 1 ? ` +${d.frequencies.length - 1} more` : ""}`}
                      </td>
                      <td className="px-6 py-3 text-slate-600 whitespace-nowrap">{d.nextBillingDate ? formatDateCDT(d.nextBillingDate) : "—"}</td>
                      <td className="px-6 py-3 text-slate-600 whitespace-nowrap">
                        {d.lastSuccessfulPayment ? `${formatCents(d.lastSuccessfulPayment.amountCents)} · ${formatDateCDT(d.lastSuccessfulPayment.date)}` : "—"}
                      </td>
                      <td className="px-6 py-3 text-right text-slate-600">{d.failedPaymentCount > 0 ? <span className="text-red-600 font-semibold">{d.failedPaymentCount}</span> : "0"}</td>
                      <td className="px-6 py-3 text-right font-semibold text-slate-900">{formatCents(d.lifetimeRecurringDonatedCents)}</td>
                    </ClickableTableRow>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {sp.id && <RecurringDonorDrawer donorId={sp.id} churchId={churchId} />}
      </div>

      {rows.length > 0 && <div className="mt-4"><Pagination page={page} pageCount={pageCount} total={totalCount} pageSize={PAGE_SIZE} /></div>}
    </div>
  );
}
