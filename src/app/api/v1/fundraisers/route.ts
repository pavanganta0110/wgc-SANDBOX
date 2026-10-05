import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/api/withApiAuth";
import { apiSuccess, apiError, parsePagination, paginationMeta } from "@/lib/api/response";
import { generateUniqueSlug } from "@/lib/campaigns/slugs";
import { provisionCampaignGivingLink } from "@/lib/campaigns/campaignGivingLinks";
import { getFundraiserRaisedCents } from "@/lib/campaigns/campaignTotals";
import { emitEvent } from "@/lib/events/emitEvent";

export const GET = withApiAuth("fundraisers:read", async (req, auth, requestId) => {
  const { searchParams } = new URL(req.url);
  const { limit, cursor } = parsePagination(searchParams);
  const campaignId = searchParams.get("campaignId") || undefined;

  const fundraisers = await prisma.campaignFundraiser.findMany({
    where: { churchId: auth.churchId, ...(campaignId ? { fundraisingCampaignId: campaignId } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const { page, hasMore, nextCursor } = paginationMeta(fundraisers, limit);
  const withTotals = await Promise.all(page.map(async (f) => ({ ...f, raisedCents: await getFundraiserRaisedCents(auth.churchId, f.id) })));
  return apiSuccess(withTotals, requestId, { hasMore, nextCursor });
});

export const POST = withApiAuth("fundraisers:write", async (req, auth, requestId) => {
  const body = await req.json().catch(() => ({}));
  const { displayName, fundraisingCampaignId, campaignTeamId } = body;

  if (!displayName || typeof displayName !== "string" || !displayName.trim()) {
    return apiError("validation_error", "`displayName` is required.", requestId);
  }
  if (!fundraisingCampaignId || typeof fundraisingCampaignId !== "string") {
    return apiError("validation_error", "`fundraisingCampaignId` is required.", requestId);
  }

  const churchId = auth.churchId;
  const campaign = await prisma.fundraisingCampaign.findFirst({ where: { id: fundraisingCampaignId, churchId }, select: { id: true, name: true } });
  if (!campaign) return apiError("validation_error", "`fundraisingCampaignId` does not refer to a campaign in this organization.", requestId);

  let team: { id: string } | null = null;
  if (campaignTeamId) {
    team = await prisma.campaignTeam.findFirst({ where: { id: campaignTeamId, churchId, fundraisingCampaignId }, select: { id: true } });
    if (!team) return apiError("validation_error", "`campaignTeamId` does not refer to a team on this campaign.", requestId);
  }

  const slug = await generateUniqueSlug(displayName.trim(), async (candidate) => !!(await prisma.campaignFundraiser.findUnique({ where: { slug: candidate } })));

  const fundraiser = await prisma.campaignFundraiser.create({
    data: { churchId, fundraisingCampaignId, campaignTeamId: team?.id ?? null, displayName: displayName.trim(), slug },
  });

  const givingLinkId = await provisionCampaignGivingLink({
    churchId,
    internalName: `${campaign.name} — Fundraiser: ${fundraiser.displayName} (API)`,
    publicTitle: fundraiser.displayName,
    ownerUserId: null,
    fundraisingCampaignId,
    campaignTeamId: team?.id ?? null,
    campaignFundraiserId: fundraiser.id,
  });
  const updated = await prisma.campaignFundraiser.update({ where: { id: fundraiser.id }, data: { givingLinkId } });

  try {
    await emitEvent({ type: "fundraiser.created", churchId, data: { fundraiserId: fundraiser.id, displayName: fundraiser.displayName, campaignId: fundraisingCampaignId, source: "api" } });
  } catch (err) {
    console.error("Failed to emit fundraiser.created event (API):", err);
  }

  return apiSuccess(updated, requestId);
});
