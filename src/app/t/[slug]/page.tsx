import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { loadPublicTeamBySlug, describeUnavailableCampaign } from "@/lib/campaigns/loadPublicCampaignData";
import { getPreviewChurchId } from "@/lib/campaigns/campaignPreviewSession";
import { getFundraiserLeaderboard } from "@/lib/campaigns/campaignTotals";
import OrganizationBrandHeader from "@/components/merchant/OrganizationBrandHeader";
import ProgressBar from "@/components/campaigns/ProgressBar";
import RecentGiftsList from "@/components/campaigns/RecentGiftsList";
import CampaignPreviewBanner from "@/components/campaigns/CampaignPreviewBanner";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const team = await prisma.campaignTeam.findUnique({ where: { slug } });
  if (!team) return {};
  const campaign = await prisma.fundraisingCampaign.findUnique({ where: { id: team.fundraisingCampaignId } });
  if (!campaign) return {};

  const title = `${team.name} | ${campaign.name}`;
  const description = `Support Team ${team.name}, fundraising for ${campaign.name}.`;

  return {
    title,
    description,
    alternates: { canonical: `/t/${team.slug}` },
    robots: campaign.publiclyIndexable ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: { title, description, url: `https://www.wgcpayments.com/t/${team.slug}` },
  };
}

export default async function PublicTeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const previewChurchId = await getPreviewChurchId();
  const result = await loadPublicTeamBySlug(slug, previewChurchId);
  if (!result.ok) {
    if (result.notFound) notFound();
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-slate-50">
        <div className="max-w-md text-center bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
          <h1 className="text-xl font-bold text-slate-900 mb-2">{result.message}</h1>
          <p className="text-sm text-slate-500">Please contact {result.church.name} for more information.</p>
        </div>
      </div>
    );
  }
  if (result.view.kind !== "team") notFound();

  const { team, campaign, church, giveHref, raisedCents, donorCount, recentGifts, isPreview } = result.view;
  const teamFundraisers = await getFundraiserLeaderboard(team.churchId, campaign.id, team.id);

  return (
    <>
      {isPreview && <CampaignPreviewBanner campaignId={campaign.id} message={describeUnavailableCampaign(campaign)} />}
      <div className="min-h-screen py-12 px-4 bg-slate-50">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 mb-6">
          <OrganizationBrandHeader logoUrl={church.logoUrl} organizationName={church.name} kind="Team Page" />
          <p className="text-xs text-center text-wgc-gold-600 font-bold uppercase tracking-widest mb-2">
            <Link href={`/c/${campaign.slug}`} className="hover:underline">{campaign.name}</Link>
          </p>
          {team.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={team.imageUrl} alt={team.name} className="w-full h-48 object-cover rounded-xl mb-6" />
          )}
          <h1 className="text-2xl font-bold text-center text-slate-900 mb-6">Team {team.name}</h1>

          <ProgressBar raisedCents={raisedCents} goalAmountCents={team.goalAmountCents} donorCount={donorCount} />

          <div className="mt-6">
            {giveHref && (
              <a
                href={giveHref}
                className="w-full text-center block bg-wgc-gold-500 text-wgc-navy-950 font-bold py-3 rounded-xl hover:bg-wgc-navy-950 hover:text-white transition-colors"
              >
                Give to Team {team.name}
              </a>
            )}
          </div>
        </div>

        {teamFundraisers.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 mb-6">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Team Members</h2>
            <ul className="space-y-3">
              {teamFundraisers.map((f) => (
                <li key={f.id} className="flex items-center justify-between">
                  <Link href={`/f/${f.slug}`} className="text-sm font-semibold text-slate-900 hover:text-wgc-gold-600">
                    {f.name}
                  </Link>
                  <span className="text-sm font-bold text-slate-700">{(f.raisedCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Recent Gifts</h2>
          <RecentGiftsList
            gifts={recentGifts.map((g) => ({ id: g.id, amountCents: g.amountCents, donorName: g.donorName ?? "Anonymous", message: g.message, createdAt: g.createdAt }))}
          />
        </div>

        <div className="text-center mt-6">
          <span className="text-xs text-slate-400">Powered by WGC</span>
        </div>
      </div>
      </div>
    </>
  );
}
