import { prisma } from "@/lib/prisma";
import { getCampaignRaisedCents, getTeamRaisedCents, getFundraiserRaisedCents, getRecentGifts, getDonorCount } from "@/lib/campaigns/campaignTotals";

interface CampaignPublicView {
  kind: "campaign";
  campaign: NonNullable<Awaited<ReturnType<typeof prisma.fundraisingCampaign.findUnique>>>;
  church: { name: string; logoUrl: string | null };
  giveHref: string | null;
  raisedCents: number;
  donorCount: number;
  recentGifts: Awaited<ReturnType<typeof getRecentGifts>>;
}

interface TeamPublicView {
  kind: "team";
  team: NonNullable<Awaited<ReturnType<typeof prisma.campaignTeam.findUnique>>>;
  campaign: NonNullable<Awaited<ReturnType<typeof prisma.fundraisingCampaign.findUnique>>>;
  church: { name: string; logoUrl: string | null };
  giveHref: string | null;
  raisedCents: number;
  donorCount: number;
  recentGifts: Awaited<ReturnType<typeof getRecentGifts>>;
}

interface FundraiserPublicView {
  kind: "fundraiser";
  fundraiser: NonNullable<Awaited<ReturnType<typeof prisma.campaignFundraiser.findUnique>>>;
  campaign: NonNullable<Awaited<ReturnType<typeof prisma.fundraisingCampaign.findUnique>>>;
  church: { name: string; logoUrl: string | null };
  giveHref: string | null;
  raisedCents: number;
  donorCount: number;
  recentGifts: Awaited<ReturnType<typeof getRecentGifts>>;
}

type PublicView = CampaignPublicView | TeamPublicView | FundraiserPublicView;

/**
 * Mirrors loadPublicGivingPageData's three-way result: a truly-missing slug
 * (notFound: true, render Next's real 404) is a different situation from an
 * existing campaign that just isn't reachable right now (notFound: false,
 * with a specific reason) — a merchant's own Draft/Paused/Completed campaign
 * should never look like a broken link to whoever it was shared with.
 */
export type PublicCampaignResult =
  | { ok: false; notFound: true }
  | { ok: false; notFound: false; message: string; church: { name: string; logoUrl: string | null } }
  | { ok: true; view: PublicView };

function describeUnavailableCampaign(campaign: { status: string; archivedAt: Date | null }): string {
  if (campaign.archivedAt) return "This campaign is no longer available.";
  switch (campaign.status) {
    case "DRAFT":
      return "This campaign hasn't been published yet.";
    case "PAUSED":
      return "This campaign isn't currently accepting gifts.";
    case "COMPLETED":
      return "This campaign has ended. Thank you to everyone who gave!";
    default:
      return "This campaign is not currently active.";
  }
}

async function loadGiveHref(givingLinkId: string | null): Promise<string | null> {
  if (!givingLinkId) return null;
  const link = await prisma.givingLink.findUnique({ where: { id: givingLinkId }, select: { publicSlug: true } });
  return link ? `/g/${link.publicSlug}` : null;
}

export async function loadPublicCampaignBySlug(slug: string): Promise<PublicCampaignResult> {
  const campaign = await prisma.fundraisingCampaign.findUnique({ where: { slug } });
  if (!campaign) return { ok: false, notFound: true };

  const church = await prisma.church.findUnique({ where: { id: campaign.churchId }, select: { name: true, logoUrl: true } });
  if (!church) return { ok: false, notFound: true };

  if (campaign.status !== "ACTIVE" || campaign.archivedAt) {
    return { ok: false, notFound: false, message: describeUnavailableCampaign(campaign), church };
  }

  const [raisedCents, donorCount, recentGifts, giveHref] = await Promise.all([
    getCampaignRaisedCents(campaign.churchId, campaign.id),
    getDonorCount(campaign.churchId, { fundraisingCampaignId: campaign.id }),
    getRecentGifts(campaign.churchId, { fundraisingCampaignId: campaign.id }, 20),
    loadGiveHref(campaign.givingLinkId),
  ]);

  return { ok: true, view: { kind: "campaign", campaign, church, giveHref, raisedCents, donorCount, recentGifts } };
}

export async function loadPublicTeamBySlug(slug: string): Promise<PublicCampaignResult> {
  const team = await prisma.campaignTeam.findUnique({ where: { slug } });
  if (!team) return { ok: false, notFound: true };

  const campaign = await prisma.fundraisingCampaign.findUnique({ where: { id: team.fundraisingCampaignId } });
  if (!campaign) return { ok: false, notFound: true };

  const church = await prisma.church.findUnique({ where: { id: team.churchId }, select: { name: true, logoUrl: true } });
  if (!church) return { ok: false, notFound: true };

  if (campaign.status !== "ACTIVE" || campaign.archivedAt) {
    return { ok: false, notFound: false, message: describeUnavailableCampaign(campaign), church };
  }

  const [raisedCents, donorCount, recentGifts, giveHref] = await Promise.all([
    getTeamRaisedCents(team.churchId, team.id),
    getDonorCount(team.churchId, { campaignTeamId: team.id }),
    getRecentGifts(team.churchId, { campaignTeamId: team.id }, 20),
    loadGiveHref(team.givingLinkId),
  ]);

  return { ok: true, view: { kind: "team", team, campaign, church, giveHref, raisedCents, donorCount, recentGifts } };
}

export async function loadPublicFundraiserBySlug(slug: string): Promise<PublicCampaignResult> {
  const fundraiser = await prisma.campaignFundraiser.findUnique({ where: { slug } });
  if (!fundraiser) return { ok: false, notFound: true };

  const campaign = await prisma.fundraisingCampaign.findUnique({ where: { id: fundraiser.fundraisingCampaignId } });
  if (!campaign) return { ok: false, notFound: true };

  const church = await prisma.church.findUnique({ where: { id: fundraiser.churchId }, select: { name: true, logoUrl: true } });
  if (!church) return { ok: false, notFound: true };

  if (campaign.status !== "ACTIVE" || campaign.archivedAt) {
    return { ok: false, notFound: false, message: describeUnavailableCampaign(campaign), church };
  }

  const [raisedCents, donorCount, recentGifts, giveHref] = await Promise.all([
    getFundraiserRaisedCents(fundraiser.churchId, fundraiser.id),
    getDonorCount(fundraiser.churchId, { campaignFundraiserId: fundraiser.id }),
    getRecentGifts(fundraiser.churchId, { campaignFundraiserId: fundraiser.id }, 20),
    loadGiveHref(fundraiser.givingLinkId),
  ]);

  return { ok: true, view: { kind: "fundraiser", fundraiser, campaign, church, giveHref, raisedCents, donorCount, recentGifts } };
}
