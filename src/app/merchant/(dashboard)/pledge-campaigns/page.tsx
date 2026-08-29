import Link from "next/link";
import { redirect } from "next/navigation";
import { formatCents } from "@/lib/format";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { hasPermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { formatCalendarDateUTC } from "@/lib/formatDateTimeCDT";
import { loadPledgeCampaignsList } from "@/lib/pledges/loadPledgeCampaignsList";

function SummaryCard({ label, value, sublabel }: { label: string; value: string; sublabel?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-xl font-bold text-slate-900">{value}</p>
      {sublabel && <p className="text-xs text-slate-400 mt-0.5">{sublabel}</p>}
    </div>
  );
}

export default async function PledgeCampaignsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/login");
    throw err;
  }
  if (!hasPermission(auth, "canViewPledges")) redirect("/merchant/dashboard");

  const { status } = await searchParams;
  const campaigns = await loadPledgeCampaignsList(auth.churchId, { status });

  const activeCampaigns = campaigns.filter((c) => c.status === "ACTIVE");
  const totalPledgedCents = campaigns.reduce((sum, c) => sum + c.totalPledgedCents, 0);
  const totalFulfilledCents = campaigns.reduce((sum, c) => sum + c.totalFulfilledCents, 0);

  return (
    <div>
      <div className="sm:flex sm:items-center sm:justify-between mb-6">
        <div>
          <h2 className="text-lg font-medium">Pledge Campaigns</h2>
          <p className="mt-1 text-sm text-gray-500">Building funds, mission trips, events, and other goal-based fundraising.</p>
        </div>
        {hasPermission(auth, "canCreatePledgeCampaign") && (
          <Link
            href="/merchant/pledge-campaigns/new"
            className="mt-4 sm:mt-0 inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            New Campaign
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <SummaryCard label="Active Campaigns" value={String(activeCampaigns.length)} />
        <SummaryCard label="Total Pledged" value={formatCents(totalPledgedCents)} />
        <SummaryCard label="Total Fulfilled" value={formatCents(totalFulfilledCents)} />
        <SummaryCard label="All Campaigns" value={String(campaigns.length)} />
      </div>

      {campaigns.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center text-sm text-slate-500">
          No pledge campaigns yet.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Campaign</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Goal</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Pledged</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Fulfilled</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Pledges</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">End Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {campaigns.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm">
                    <Link href={`/merchant/pledge-campaigns/${c.id}`} className="font-semibold text-indigo-600 hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700">
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">{c.goalAmountCents != null ? formatCents(c.goalAmountCents) : "—"}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{formatCents(c.totalPledgedCents)}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{formatCents(c.totalFulfilledCents)}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{c.pledgeCount}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{c.endDate ? formatCalendarDateUTC(c.endDate) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
