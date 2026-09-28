import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { loadPublicCampaignBySlug, describeUnavailableCampaign } from "@/lib/campaigns/loadPublicCampaignData";
import { getPreviewChurchId } from "@/lib/campaigns/campaignPreviewSession";
import LiveDonationWall from "@/components/campaigns/LiveDonationWall";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const campaign = await prisma.fundraisingCampaign.findUnique({ where: { slug } });
  if (!campaign) return {};
  return {
    title: `${campaign.name} — Live Donation Wall`,
    robots: { index: false, follow: false },
  };
}

export default async function CampaignWallPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const previewChurchId = await getPreviewChurchId();
  const result = await loadPublicCampaignBySlug(slug, previewChurchId);
  if (!result.ok) {
    if (result.notFound) notFound();
    return (
      <div className="min-h-screen bg-wgc-navy-950 text-white flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold mb-2">{result.message}</h1>
          <p className="text-white/50 text-sm">Please contact {result.church.name} for more information.</p>
        </div>
      </div>
    );
  }
  if (result.view.kind !== "campaign") notFound();

  const { campaign, church, raisedCents, donorCount, recentGifts, isPreview } = result.view;

  return (
    <LiveDonationWall
      slug={slug}
      previewMessage={isPreview ? describeUnavailableCampaign(campaign) : undefined}
      initial={{
        name: campaign.name,
        organizationName: church.name,
        logoUrl: church.logoUrl,
        imageUrl: campaign.imageUrl,
        goalAmountCents: campaign.goalAmountCents,
        raisedCents,
        donorCount,
        recentGifts: recentGifts.map((g) => ({
          id: g.id,
          amountCents: g.amountCents,
          donorName: g.donorName ?? "Anonymous",
          message: g.message,
          createdAt: g.createdAt.toISOString(),
        })),
      }}
    />
  );
}
