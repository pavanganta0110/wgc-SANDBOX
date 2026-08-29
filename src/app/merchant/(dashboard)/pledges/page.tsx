import Link from "next/link";
import { redirect } from "next/navigation";
import { formatCents } from "@/lib/format";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { hasPermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { formatDateCDT } from "@/lib/formatDateTimeCDT";
import { prisma } from "@/lib/prisma";
import { loadPledgesList } from "@/lib/pledges/loadPledgesList";
import RecordPledgeForm from "@/components/merchant/RecordPledgeForm";
import LinkPledgeFulfillmentButton from "@/components/merchant/LinkPledgeFulfillmentButton";

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

export default async function PledgesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/login");
    throw err;
  }
  if (!hasPermission(auth, "canViewPledges")) redirect("/merchant/dashboard");
  const canCreatePledge = hasPermission(auth, "canCreatePledge");
  const canRecordFulfillment = hasPermission(auth, "canRecordPledgeFulfillment");

  const { status } = await searchParams;
  const [pledges, campaigns, donors] = await Promise.all([
    loadPledgesList(auth.churchId, { status }),
    canCreatePledge
      ? prisma.pledgeCampaign.findMany({ where: { churchId: auth.churchId, status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { createdAt: "desc" } })
      : Promise.resolve([]),
    canCreatePledge
      ? prisma.donor.findMany({ where: { churchId: auth.churchId, archivedAt: null }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" }, take: 500 })
      : Promise.resolve([]),
  ]);
  const unmatched = pledges.filter((p) => p.donorMatchStatus === "UNMATCHED");
  const totalPledgedCents = pledges.reduce((sum, p) => sum + p.pledgeAmountCents, 0);
  const totalFulfilledCents = pledges.reduce((sum, p) => sum + p.fulfilledAmountCents, 0);

  return (
    <div>
      <div className="sm:flex sm:items-center sm:justify-between mb-6">
        <div>
          <h2 className="text-lg font-medium">Pledges</h2>
          <p className="mt-1 text-sm text-gray-500">Every recorded pledge across all campaigns.</p>
        </div>
        <Link href="/merchant/pledge-campaigns" className="mt-4 sm:mt-0 text-sm text-indigo-600 hover:underline">
          Manage Campaigns →
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <SummaryCard label="Total Pledges" value={String(pledges.length)} />
        <SummaryCard label="Total Pledged" value={formatCents(totalPledgedCents)} />
        <SummaryCard label="Total Fulfilled" value={formatCents(totalFulfilledCents)} />
        <SummaryCard label="Unmatched" value={String(unmatched.length)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {pledges.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center text-sm text-slate-500">
              No pledges recorded yet.
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Donor</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Campaign</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Pledged</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Fulfilled</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Pledged On</th>
                    {canRecordFulfillment && <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">&nbsp;</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pledges.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm">
                        {p.donorId ? (
                          <Link href={`/merchant/donors/${p.donorId}`} className="text-indigo-600 hover:underline">{p.donorName}</Link>
                        ) : (
                          <span className="text-slate-700">{p.donorName}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <Link href={`/merchant/pledge-campaigns/${p.pledgeCampaignId}`} className="text-slate-700 hover:underline">
                          {p.campaignName}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">{formatCents(p.pledgeAmountCents)}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">{formatCents(p.fulfilledAmountCents)}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700">{p.status}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">{formatDateCDT(p.pledgedAt)}</td>
                      {canRecordFulfillment && (
                        <td className="px-4 py-3 text-sm">
                          {p.donorId && (p.status === "PROMISED" || p.status === "PARTIALLY_FULFILLED") ? (
                            <LinkPledgeFulfillmentButton pledgeId={p.id} />
                          ) : null}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {canCreatePledge && (
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-3">Add a Pledge</h3>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              {campaigns.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Create a campaign first — see{" "}
                  <Link href="/merchant/pledge-campaigns" className="text-indigo-600 hover:underline">Manage Campaigns</Link>.
                </p>
              ) : (
                <RecordPledgeForm donors={donors} campaigns={campaigns} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
