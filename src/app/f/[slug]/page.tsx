import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { loadPublicFundraiserBySlug, describeUnavailableCampaign } from "@/lib/campaigns/loadPublicCampaignData";
import { getPreviewChurchId } from "@/lib/campaigns/campaignPreviewSession";
import OrganizationBrandHeader from "@/components/merchant/OrganizationBrandHeader";
import ProgressBar from "@/components/campaigns/ProgressBar";
import RecentGiftsList from "@/components/campaigns/RecentGiftsList";
import CampaignPreviewBanner from "@/components/campaigns/CampaignPreviewBanner";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const fundraiser = await prisma.campaignFundraiser.findUnique({ where: { slug } });
  if (!fundraiser) return {};
  const campaign = await prisma.fundraisingCampaign.findUnique({ where: { id: fundraiser.fundraisingCampaignId } });
  if (!campaign) return {};

  const title = `${fundraiser.displayName} is fundraising for ${campaign.name}`;
  const description = fundraiser.personalStory || `Support ${fundraiser.displayName}'s fundraiser for ${campaign.name}.`;

  return {
    title,
    description,
    alternates: { canonical: `/f/${fundraiser.slug}` },
    robots: campaign.publiclyIndexable ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: {
      title,
      description,
      images: fundraiser.imageUrl ? [{ url: fundraiser.imageUrl }] : undefined,
      url: `https://www.wgcpayments.com/f/${fundraiser.slug}`,
    },
  };
}

export default async function PublicFundraiserPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const previewChurchId = await getPreviewChurchId();
  const result = await loadPublicFundraiserBySlug(slug, previewChurchId);
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
  if (result.view.kind !== "fundraiser") notFound();

  const { fundraiser, campaign, church, giveHref, raisedCents, donorCount, recentGifts, isPreview } = result.view;

  return (
    <>
      {isPreview && <CampaignPreviewBanner campaignId={campaign.id} message={describeUnavailableCampaign(campaign)} />}
      <div className="min-h-screen py-12 px-4 bg-slate-50">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 mb-6">
          <OrganizationBrandHeader logoUrl={church.logoUrl} organizationName={church.name} kind="Fundraiser Page" />
          <p className="text-xs text-center text-wgc-gold-600 font-bold uppercase tracking-widest mb-2">
            <Link href={`/c/${campaign.slug}`} className="hover:underline">{campaign.name}</Link>
          </p>
          {fundraiser.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fundraiser.imageUrl} alt={fundraiser.displayName} className="w-full h-48 object-cover rounded-full mx-auto mb-6 max-w-[192px]" />
          )}
          <h1 className="text-2xl font-bold text-center text-slate-900 mb-1">{fundraiser.displayName}</h1>
          <p className="text-sm text-center text-slate-500 mb-6">is fundraising for {campaign.name}</p>
          {fundraiser.personalStory && (
            <p className="text-sm text-center text-slate-600 mb-6 whitespace-pre-line">{fundraiser.personalStory}</p>
          )}

          <ProgressBar raisedCents={raisedCents} goalAmountCents={fundraiser.goalAmountCents} donorCount={donorCount} />

          <div className="mt-6">
            {giveHref && (
              <a
                href={giveHref}
                className="w-full text-center block bg-wgc-gold-500 text-wgc-navy-950 font-bold py-3 rounded-xl hover:bg-wgc-navy-950 hover:text-white transition-colors"
              >
                Give to {fundraiser.displayName}
              </a>
            )}
          </div>
        </div>

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
