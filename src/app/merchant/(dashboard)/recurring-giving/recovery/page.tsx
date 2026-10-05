import Link from "next/link";
import { redirect } from "next/navigation";
import { formatCents } from "@/lib/format";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { getSubscriptionPermissions } from "@/lib/subscriptions/subscriptionPermissions";
import { loadRecurringDonorsAnalytics } from "@/lib/subscriptions/recurringDonorsAnalytics";
import { loadRecoveryAnalytics } from "@/lib/subscriptions/recoveryAnalytics";

function SummaryCard({ label, value, sublabel }: { label: string; value: string; sublabel?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-xl font-bold text-slate-900">{value}</p>
      {sublabel && <p className="text-xs text-slate-400 mt-0.5">{sublabel}</p>}
    </div>
  );
}

const ACTION_LABELS: Record<string, string> = {
  UPDATE_LINK_SENT: "Payment update link sent",
  UPDATE_LINK_SEND_FAILED: "Payment update link failed to send",
  SKIPPED_NO_DONOR_EMAIL: "Skipped — no donor email on file",
  SKIPPED_NOT_ACTIVE_OR_PAST_DUE: "Skipped — subscription not active/past-due",
  SKIPPED_RECENTLY_SENT: "Skipped — already reached out recently",
};

export default async function RecurringGivingRecoveryPage() {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/login");
    throw err;
  }
  const permissions = getSubscriptionPermissions(auth.impersonation ? "owner" : auth.rawRole);
  if (!permissions.canView) redirect("/merchant/dashboard");

  const [donorAnalytics, recovery] = await Promise.all([loadRecurringDonorsAnalytics(auth.churchId), loadRecoveryAnalytics(auth.churchId)]);

  return (
    <div>
      <div className="mb-6">
        <Link href="/merchant/recurring-donors" className="text-sm text-indigo-600 hover:underline">
          &larr; Recurring Donors
        </Link>
        <h2 className="mt-2 text-lg font-medium">Recurring Giving Recovery</h2>
        <p className="mt-1 text-sm text-gray-500">
          Every failed recurring charge automatically gets the donor a secure payment-update link — this is where you track whether it worked.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <SummaryCard label="Past-Due Donors" value={String(donorAnalytics.summary.pastDueRecurringDonors)} />
        <SummaryCard label="Failed Payments (30d)" value={String(recovery.failedPaymentCount)} />
        <SummaryCard
          label="Recovered"
          value={String(recovery.recoveredSubscriptionCount)}
          sublabel={`of ${recovery.failedSubscriptionCount} failing subscriptions`}
        />
        <SummaryCard label="Recovery Rate (30d)" value={`${recovery.recoveryRatePct}%`} />
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">Needs Attention</h3>
        </div>
        {donorAnalytics.attentionList.length === 0 ? (
          <p className="p-6 text-sm text-slate-500 text-center">No recurring donors currently require attention.</p>
        ) : (
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Donor</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Reason</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Monthly Value</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Recommended Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {donorAnalytics.attentionList.map((a) => (
                <tr key={a.donorId} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm">
                    <Link href={`/merchant/recurring-donors?id=${a.donorId}`} className="font-semibold text-indigo-600 hover:underline">
                      {a.donorName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">{a.reasons.join(", ")}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{formatCents(a.monthlyValueCents)}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{a.recommendedAction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">Recent Recovery Activity</h3>
        </div>
        {recovery.recentAttempts.length === 0 ? (
          <p className="p-6 text-sm text-slate-500 text-center">No recovery activity in the last 30 days.</p>
        ) : (
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">When</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Subscription</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recovery.recentAttempts.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-3 text-sm text-slate-500">{new Date(a.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-slate-500 font-mono text-xs">{a.finixSubscriptionId}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">{ACTION_LABELS[a.action] ?? a.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
