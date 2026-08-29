import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { formatCents } from "@/lib/format";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { hasPermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { formatCalendarDateUTC, formatDateCDT } from "@/lib/formatDateTimeCDT";
import { prisma } from "@/lib/prisma";
import { computeCampaignProgress } from "@/lib/pledges/pledgeFulfillment";
import { loadPledgesList } from "@/lib/pledges/loadPledgesList";
import RecordPledgeForm from "@/components/merchant/RecordPledgeForm";
import LinkPledgeFulfillmentButton from "@/components/merchant/LinkPledgeFulfillmentButton";

export default async function PledgeCampaignDetailPage({ params }: { params: Promise<{ campaignId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/login");
    throw err;
  }
  if (!hasPermission(auth, "canViewPledges")) redirect("/merchant/dashboard");

  const { campaignId } = await params;
  const campaign = await prisma.pledgeCampaign.findFirst({ where: { id: campaignId, churchId: auth.churchId } });
  if (!campaign) notFound();

  const [progress, pledges, donors] = await Promise.all([
    computeCampaignProgress(auth.churchId, campaignId),
    loadPledgesList(auth.churchId, { pledgeCampaignId: campaignId }),
    prisma.donor.findMany({ where: { churchId: auth.churchId, archivedAt: null }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" }, take: 500 }),
  ]);

  return (
    <div>
      <Link href="/merchant/pledge-campaigns" className="text-sm text-indigo-600 hover:underline">← All Campaigns</Link>

      <div className="mt-3 flex items-center justify-between">
        <h2 className="text-lg font-medium">{campaign.name}</h2>
        <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700">{campaign.status}</span>
      </div>
      {campaign.description && <p className="mt-1 text-sm text-slate-500">{campaign.description}</p>}

      <div className="mt-6 bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-baseline justify-between mb-2">
          <p className="text-2xl font-bold text-slate-900">{formatCents(progress.totalFulfilledCents)}</p>
          {progress.goalAmountCents != null && (
            <p className="text-sm text-slate-500">of {formatCents(progress.goalAmountCents)} goal</p>
          )}
        </div>
        {progress.percentOfGoal != null && (
          <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full bg-indigo-500" style={{ width: `${progress.percentOfGoal}%` }} />
          </div>
        )}
        <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-slate-500">Pledged</p>
            <p className="font-semibold text-slate-900">{formatCents(progress.totalPledgedCents)}</p>
          </div>
          <div>
            <p className="text-slate-500">Pledges</p>
            <p className="font-semibold text-slate-900">{progress.pledgeCount}</p>
          </div>
          <div>
            <p className="text-slate-500">End Date</p>
            <p className="font-semibold text-slate-900">{campaign.endDate ? formatCalendarDateUTC(campaign.endDate) : "—"}</p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Pledges</h3>
          {pledges.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 text-sm text-slate-500">No pledges recorded yet.</div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Donor</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Pledged</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Fulfilled</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Pledged On</th>
                    {hasPermission(auth, "canRecordPledgeFulfillment") && <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">&nbsp;</th>}
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
                      <td className="px-4 py-3 text-sm text-slate-500">{formatCents(p.pledgeAmountCents)}</td>
                      <td className="px-4 py-3 text-sm text-slate-500">{formatCents(p.fulfilledAmountCents)}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700">{p.status}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">{formatDateCDT(p.pledgedAt)}</td>
                      {hasPermission(auth, "canRecordPledgeFulfillment") && (
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

        {hasPermission(auth, "canCreatePledge") && (
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-3">Record a Pledge</h3>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <RecordPledgeForm pledgeCampaignId={campaign.id} donors={donors} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
