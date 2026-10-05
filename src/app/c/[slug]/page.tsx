import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { loadPublicCampaignBySlug, describeUnavailableCampaign } from "@/lib/campaigns/loadPublicCampaignData";
import { getPreviewChurchId } from "@/lib/campaigns/campaignPreviewSession";
import { getFundraiserLeaderboard, getTeamLeaderboard } from "@/lib/campaigns/campaignTotals";
import { formatCalendarDateUTC } from "@/lib/formatDateTimeCDT";
import OrganizationBrandHeader from "@/components/merchant/OrganizationBrandHeader";
import ProgressBar from "@/components/campaigns/ProgressBar";
import RecentGiftsList from "@/components/campaigns/RecentGiftsList";
import CampaignPreviewBanner from "@/components/campaigns/CampaignPreviewBanner";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const campaign = await prisma.fundraisingCampaign.findUnique({ where: { slug } });
  if (!campaign || campaign.status !== "ACTIVE" || campaign.archivedAt) return {};

  const church = await prisma.church.findUnique({ where: { id: campaign.churchId }, select: { name: true } });
  const title = `${campaign.name}${church ? ` | ${church.name}` : ""}`;
  const description = campaign.description || `Support ${campaign.name}${church ? ` by ${church.name}` : ""}.`;

  return {
    title,
    description,
    alternates: { canonical: `/c/${campaign.slug}` },
    robots: campaign.publiclyIndexable ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: {
      title,
      description,
      images: campaign.imageUrl ? [{ url: campaign.imageUrl }] : undefined,
      url: `https://www.wgcpayments.com/c/${campaign.slug}`,
    },
  };
}

export default async function PublicCampaignPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const previewChurchId = await getPreviewChurchId();
  const result = await loadPublicCampaignBySlug(slug, previewChurchId);
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
  if (result.view.kind !== "campaign") notFound();

  const { campaign, church, giveHref, raisedCents, donorCount, recentGifts, isPreview } = result.view;

  const [teams, fundraisers] = await Promise.all([
    getTeamLeaderboard(campaign.churchId, campaign.id),
    getFundraiserLeaderboard(campaign.churchId, campaign.id),
  ]);

  return (
    <>
      {isPreview && <CampaignPreviewBanner campaignId={campaign.id} message={describeUnavailableCampaign(campaign)} />}
      <div className="min-h-screen py-12 px-4 bg-slate-50">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mb-6">
          {campaign.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={campaign.imageUrl} alt={campaign.name} className="w-full h-48 object-cover" />
          )}
          <div className="p-8">
          <OrganizationBrandHeader logoUrl={church.logoUrl} organizationName={church.name} kind="Fundraising Campaign" compact={Boolean(campaign.imageUrl)} />
          <h1 className="text-2xl font-bold text-center text-slate-900 mb-1">{campaign.name}</h1>
          <div className="mb-6" />
          {campaign.description && <p className="text-sm text-center text-slate-600 mb-6">{campaign.description}</p>}

          <ProgressBar raisedCents={raisedCents} goalAmountCents={campaign.goalAmountCents} donorCount={donorCount} />

          {campaign.endDate && (
            <p className="text-xs text-slate-400 text-center mt-3">Ends {formatCalendarDateUTC(campaign.endDate)}</p>
          )}

          <div className="mt-6 flex flex-col gap-3">
            {giveHref && (
              <a
                href={giveHref}
                className="w-full text-center bg-wgc-gold-500 text-wgc-navy-950 font-bold py-3 rounded-xl hover:bg-wgc-navy-950 hover:text-white transition-colors"
              >
                Give Now
              </a>
            )}
            <Link
              href={`/c/${campaign.slug}/wall`}
              className="w-full text-center text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors"
            >
              View Live Donation Wall &rarr;
            </Link>
          </div>
          </div>
        </div>

        {teams.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 mb-6">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Teams</h2>
            <ul className="space-y-3">
              {teams.map((t, i) => (
                <li key={t.id} className="flex items-center justify-between">
                  <Link href={`/t/${t.slug}`} className="text-sm font-semibold text-slate-900 hover:text-wgc-gold-600">
                    {i < 3 && <span className="text-slate-400 mr-2">#{i + 1}</span>}
                    {t.name}
                  </Link>
                  <span className="text-sm font-bold text-slate-700">{(t.raisedCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {fundraisers.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 mb-6">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Fundraisers</h2>
            <ul className="space-y-3">
              {fundraisers.map((f, i) => (
                <li key={f.id} className="flex items-center justify-between">
                  <Link href={`/f/${f.slug}`} className="text-sm font-semibold text-slate-900 hover:text-wgc-gold-600">
                    {i < 3 && <span className="text-slate-400 mr-2">#{i + 1}</span>}
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
