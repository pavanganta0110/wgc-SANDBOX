import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { formatCalendarDateUTC } from "@/lib/formatDateTimeCDT";
import OrganizationLogo from "@/components/merchant/OrganizationLogo";
import PublicPledgeForm from "@/components/giving/PublicPledgeForm";
import { computeCampaignProgress } from "@/lib/pledges/pledgeFulfillment";

export default async function PublicCampaignPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const campaign = await prisma.pledgeCampaign.findUnique({ where: { publicSlug: slug } });
  if (!campaign || campaign.status !== "ACTIVE") notFound();

  const church = await prisma.church.findUnique({ where: { id: campaign.churchId }, select: { name: true, logoUrl: true } });
  if (!church) notFound();

  const progress = await computeCampaignProgress(campaign.churchId, campaign.id);

  const giveNowHref = campaign.givingLinkSlug ? `/g/${campaign.givingLinkSlug}` : null;

  return (
    <div className="min-h-screen py-12 px-4 bg-slate-50">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
        <OrganizationLogo logoUrl={church.logoUrl} churchName={church.name} mode="main" />
        <h1 className="text-lg font-bold text-center text-slate-900 mb-1">{campaign.name}</h1>
        <p className="text-sm text-center text-slate-500 mb-6">{church.name}</p>
        {campaign.description && (
          <p className="text-sm text-center text-slate-600 mb-6">{campaign.description}</p>
        )}

        <div className="mb-6">
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
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
            <span>{progress.pledgeCount} {progress.pledgeCount === 1 ? "pledge" : "pledges"}</span>
            {campaign.endDate && <span>Ends {formatCalendarDateUTC(campaign.endDate)}</span>}
          </div>
        </div>

        <PublicPledgeForm
          slug={slug}
          unitLabel={campaign.unitLabel}
          unitAmountCents={campaign.unitAmountCents}
          giveNowHref={giveNowHref}
        />

        <div className="text-center mt-6">
          <span className="text-xs text-slate-400">Powered by WGC</span>
        </div>
      </div>
    </div>
  );
}
