import Link from "next/link";
import { Plus, Repeat } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { formatCents } from "@/lib/format";
import { formatDateCDT } from "@/lib/formatDateTimeCDT";
import StateBadge from "@/components/merchant/StateBadge";
import ClickableTableRow from "@/components/merchant/ClickableTableRow";
import SubscriptionDrawer from "@/components/merchant/SubscriptionDrawer";
import SubscriptionsFilterBar from "@/components/merchant/SubscriptionsFilterBar";
import Pagination from "@/components/merchant/Pagination";
import { getSubscriptionPermissions } from "@/lib/subscriptions/subscriptionPermissions";
import { loadSubscriptionsList, type SubscriptionsSortKey } from "@/lib/subscriptions/subscriptionsList";
import { loadSubscriptionsAnalytics } from "@/lib/subscriptions/subscriptionsAnalytics";
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

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    status?: string;
    frequency?: string;
    minAmount?: string;
    maxAmount?: string;
    hasFailedPayment?: string;
    hasPastDue?: string;
    requiresAttention?: string;
    sort?: string;
    page?: string;
    id?: string;
  }>;
}) {
  const session = await getSession();
  const churchId = session!.churchId!;
  const permissions = getSubscriptionPermissions(session?.role);
  const sp = await searchParams;

  const page = Math.max(1, parseInt(sp.page || "1", 10) || 1);
  const [sortKey, sortDir] = (sp.sort || "createdAt:desc").split(":") as [SubscriptionsSortKey, "asc" | "desc"];

  const [list, analytics] = await Promise.all([
    loadSubscriptionsList(
      churchId,
      {
        search: sp.search,
        status: sp.status as any,
        frequency: sp.frequency,
        minAmountCents: sp.minAmount ? Math.round(parseFloat(sp.minAmount) * 100) : undefined,
        maxAmountCents: sp.maxAmount ? Math.round(parseFloat(sp.maxAmount) * 100) : undefined,
        hasFailedPayment: sp.hasFailedPayment === "1",
        hasPastDue: sp.hasPastDue === "1",
        requiresAttention: sp.requiresAttention === "1",
      },
      { key: sortKey, dir: sortDir },
      page,
      PAGE_SIZE,
    ),
    loadSubscriptionsAnalytics(churchId),
  ]);

  const { rows, totalCount } = list;
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const { summary, frequencyMix, attentionList } = analytics;

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <h2 className="text-lg font-bold text-slate-900">Subscriptions</h2>
        <Link href="/merchant/subscriptions/setup-links" className="text-sm font-semibold text-blue-600 hover:underline">
          Setup Links
        </Link>
        {permissions.canCreate && (
          <div className="ml-auto">
            <Link href="/merchant/subscriptions/create" className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800">
              <Plus className="w-4 h-4" />
              Create Subscription
            </Link>
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <SummaryCard label="Active Subscriptions" value={String(summary.activeSubscriptions)} />
        <SummaryCard label="Paused Subscriptions" value={String(summary.pausedSubscriptions)} />
        <SummaryCard label="Past-Due Subscriptions" value={String(summary.pastDueSubscriptions)} />
        <SummaryCard label="Canceled Subscriptions" value={String(summary.canceledSubscriptions)} />
        <SummaryCard label="Completed Subscriptions" value={String(summary.completedSubscriptions)} />
        <SummaryCard label="Failed Subscriptions" value={String(summary.failedSubscriptions)} />
        <SummaryCard label="Monthly Recurring Value" value={formatCents(summary.monthlyRecurringValueCents)} />
        <SummaryCard label="Annualized Recurring Value" value={formatCents(summary.annualizedRecurringValueCents)} />
        <SummaryCard label="Upcoming Charges (30 Days)" value={String(summary.upcomingCharges.count)} sublabel={formatCents(summary.upcomingCharges.amountCents)} />
        <SummaryCard label="Failed This Month" value={String(summary.failedThisMonth)} />
        <SummaryCard label="Subscriptions Requiring Attention" value={String(summary.subscriptionsRequiringAttention)} />
        <SummaryCard label="Lifetime Recurring Collected" value={formatCents(summary.lifetimeRecurringCollectedCents)} />
      </div>

      {/* Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Frequency Mix</h3>
          {frequencyMix.length === 0 ? (
            <p className="text-sm text-slate-400">No active subscriptions for this period.</p>
          ) : (
            <div className="space-y-2">
              {frequencyMix.map((f) => (
                <div key={f.frequency} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">{f.frequency}</span>
                  <span className="text-slate-800 font-semibold">
                    {f.subscriptionCount} sub{f.subscriptionCount === 1 ? "" : "s"} · {formatCents(f.monthlyValueCents)}/mo
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Subscriptions Requiring Attention</h3>
          {attentionList.length === 0 ? (
            <div>
              <p className="text-sm font-semibold text-slate-900">No recurring donation issues</p>
              <p className="text-sm text-slate-500">No subscriptions currently require attention.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {attentionList.map((a) => (
                <Link key={a.subscriptionId} href={`/merchant/subscriptions/${a.subscriptionId}`} className="block hover:bg-slate-50 -mx-2 px-2 py-1.5 rounded-lg">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-slate-800">{a.donorName}</span>
                    <span className="text-slate-600">{formatCents(a.amountCents)}</span>
                  </div>
                  <p className="text-xs text-slate-500">{a.reasons.join(" · ")}</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <SubscriptionsFilterBar exportHref="/api/merchant/subscriptions/export" />

      <div className="flex items-start gap-6">
        <div className="flex-1 min-w-0 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
          {rows.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-slate-50 flex items-center justify-center mb-3">
                <Repeat className="w-6 h-6 text-slate-300" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 mb-1">No subscriptions</h3>
              <p className="text-sm text-slate-500 max-w-sm mx-auto">Recurring donation schedules will appear here after they are created.</p>
            </div>
          ) : (
            <table className="w-full text-sm min-w-[1500px]">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100">
                  <th className="px-6 py-3">Subscription ID</th>
                  <th className="px-6 py-3">Donor</th>
                  <th className="px-6 py-3 text-right">Amount</th>
                  <th className="px-6 py-3">Frequency</th>
                  <th className="px-6 py-3 text-right">Monthly Value</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Next Billing</th>
                  <th className="px-6 py-3">Payment Method</th>
                  <th className="px-6 py-3 text-right">Failed</th>
                  <th className="px-6 py-3 text-right">Lifetime Collected</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const isSelected = sp.id === s.id;
                  return (
                    <ClickableTableRow key={s.id} id={s.id} className={`border-t border-slate-50 hover:bg-slate-50 ${isSelected ? "bg-slate-50" : ""}`}>
                      <td className="px-6 py-3">
                        <span className="text-xs font-mono text-slate-500">{s.finixSubscriptionId.slice(0, 18)}…</span>
                      </td>
                      <td className="px-6 py-3">
                        <p className="font-semibold text-slate-800">{s.donorName}</p>
                        <p className="text-xs text-slate-400">{s.donorEmail || "—"}</p>
                      </td>
                      <td className="px-6 py-3 text-right font-semibold text-slate-900">{formatCents(s.amountCents)}</td>
                      <td className="px-6 py-3 text-slate-600">{frequencyLabel(s.billingInterval)}</td>
                      <td className="px-6 py-3 text-right text-slate-600">{formatCents(s.monthlyValueCents)}</td>
                      <td className="px-6 py-3"><StateBadge state={s.displayStatus} /></td>
                      <td className="px-6 py-3 text-slate-600 whitespace-nowrap">{s.nextBillingDate ? formatDateCDT(s.nextBillingDate) : "—"}</td>
                      <td className="px-6 py-3 text-slate-600">{s.paymentMethod ? `${s.paymentMethod.brand || "Bank"} ••••${s.paymentMethod.last4 || ""}` : "—"}</td>
                      <td className="px-6 py-3 text-right text-slate-600">{s.failedAttempts > 0 ? <span className="text-red-600 font-semibold">{s.failedAttempts}</span> : "0"}</td>
                      <td className="px-6 py-3 text-right font-semibold text-slate-900">{formatCents(s.lifetimeCollectedCents)}</td>
                    </ClickableTableRow>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {sp.id && <SubscriptionDrawer subscriptionId={sp.id} churchId={churchId} />}
      </div>

      {rows.length > 0 && <div className="mt-4"><Pagination page={page} pageCount={pageCount} total={totalCount} pageSize={PAGE_SIZE} /></div>}
    </div>
  );
}
