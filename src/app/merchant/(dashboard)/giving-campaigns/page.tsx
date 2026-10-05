import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { formatDateTimeCDT as formatDateTime } from "@/lib/formatDateTimeCDT";
import StateBadge from "@/components/merchant/StateBadge";

export default async function GivingCampaignsPage() {
  const session = await getSession();
  const permissions = getDonorPermissions(session?.role);
  if (!session?.churchId || !permissions.canView) {
    redirect("/merchant/dashboard");
  }
  const churchId = session.churchId;

  const campaigns = await prisma.givingCampaign.findMany({
    where: { churchId },
    orderBy: { createdAt: "desc" },
  });

  const counts = await prisma.givingCampaignRecipient.groupBy({
    by: ["campaignId"],
    where: { churchId, campaignId: { in: campaigns.map((c) => c.id) } },
    _count: true,
  });
  const paidCounts = await prisma.givingCampaignRecipient.groupBy({
    by: ["campaignId"],
    where: { churchId, campaignId: { in: campaigns.map((c) => c.id) }, paidAt: { not: null } },
    _count: true,
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Giving Campaigns</h2>
          <p className="text-sm text-slate-500 mt-1">Send a giving link to your donor list and see who gave.</p>
        </div>
        {permissions.canSendStatements && (
          <Link
            href="/merchant/giving-campaigns/create"
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold"
          >
            New Campaign
          </Link>
        )}
      </div>

      {campaigns.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center">
          <p className="text-sm text-slate-500">No campaigns sent yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100">
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3">Channel</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Recipients</th>
                <th className="px-6 py-3 text-right">Paid</th>
                <th className="px-6 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {campaigns.map((c) => {
                const total = counts.find((row) => row.campaignId === c.id)?._count ?? 0;
                const paid = paidCounts.find((row) => row.campaignId === c.id)?._count ?? 0;
                return (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-6 py-3">
                      <Link href={`/merchant/giving-campaigns/${c.id}`} className="font-medium text-slate-900 hover:underline">
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-6 py-3 text-slate-500">{c.channel === "TEXT" ? "Text" : "Email"}</td>
                    <td className="px-6 py-3">
                      <StateBadge state={c.status} />
                    </td>
                    <td className="px-6 py-3 text-right text-slate-600">{total}</td>
                    <td className="px-6 py-3 text-right font-semibold text-slate-900">{paid}</td>
                    <td className="px-6 py-3 text-slate-500">{formatDateTime(c.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
