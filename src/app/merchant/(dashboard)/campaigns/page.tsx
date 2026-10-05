import Link from "next/link";
import { redirect } from "next/navigation";
import { formatCents } from "@/lib/format";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { hasPermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { prisma } from "@/lib/prisma";
import { getCampaignRaisedCents } from "@/lib/campaigns/campaignTotals";

export default async function FundraisingCampaignsPage() {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/login");
    throw err;
  }
  if (!hasPermission(auth, "canViewFundraisingCampaigns")) redirect("/merchant/dashboard");

  const campaigns = await prisma.fundraisingCampaign.findMany({
    where: { churchId: auth.churchId, archivedAt: null },
    orderBy: { createdAt: "desc" },
  });

  const withTotals = await Promise.all(
    campaigns.map(async (c) => ({ ...c, raisedCents: await getCampaignRaisedCents(auth.churchId, c.id) }))
  );

  return (
    <div>
      <div className="sm:flex sm:items-center sm:justify-between mb-6">
        <div>
          <h2 className="text-lg font-medium">Fundraising Campaigns</h2>
          <p className="mt-1 text-sm text-gray-500">Peer-to-peer fundraising drives — teams, individual fundraisers, and live donation walls.</p>
        </div>
        {hasPermission(auth, "canCreateFundraisingCampaign") && (
          <Link
            href="/merchant/campaigns/new"
            className="mt-4 sm:mt-0 inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            New Campaign
          </Link>
        )}
      </div>

      {withTotals.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center text-sm text-slate-500">
          No fundraising campaigns yet.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Campaign</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Goal</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Raised</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {withTotals.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm">
                    <Link href={`/merchant/campaigns/${c.id}`} className="font-semibold text-indigo-600 hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700">
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">{c.goalAmountCents != null ? formatCents(c.goalAmountCents) : "—"}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{formatCents(c.raisedCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
