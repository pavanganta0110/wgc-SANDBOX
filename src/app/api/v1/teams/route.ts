import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/api/withApiAuth";
import { apiSuccess, apiError, parsePagination, paginationMeta } from "@/lib/api/response";
import { generateUniqueSlug } from "@/lib/campaigns/slugs";
import { provisionCampaignGivingLink } from "@/lib/campaigns/campaignGivingLinks";
import { getTeamRaisedCents } from "@/lib/campaigns/campaignTotals";
import { emitEvent } from "@/lib/events/emitEvent";

export const GET = withApiAuth("teams:read", async (req, auth, requestId) => {
  const { searchParams } = new URL(req.url);
  const { limit, cursor } = parsePagination(searchParams);
  const campaignId = searchParams.get("campaignId") || undefined;

  const teams = await prisma.campaignTeam.findMany({
    where: { churchId: auth.churchId, ...(campaignId ? { fundraisingCampaignId: campaignId } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const { page, hasMore, nextCursor } = paginationMeta(teams, limit);
  const withTotals = await Promise.all(page.map(async (t) => ({ ...t, raisedCents: await getTeamRaisedCents(auth.churchId, t.id) })));
  return apiSuccess(withTotals, requestId, { hasMore, nextCursor });
});

export const POST = withApiAuth("teams:write", async (req, auth, requestId) => {
  const body = await req.json().catch(() => ({}));
  const { name, fundraisingCampaignId } = body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return apiError("validation_error", "`name` is required.", requestId);
  }
  if (!fundraisingCampaignId || typeof fundraisingCampaignId !== "string") {
    return apiError("validation_error", "`fundraisingCampaignId` is required.", requestId);
  }

  const churchId = auth.churchId;
  const campaign = await prisma.fundraisingCampaign.findFirst({ where: { id: fundraisingCampaignId, churchId }, select: { id: true, name: true } });
  if (!campaign) return apiError("validation_error", "`fundraisingCampaignId` does not refer to a campaign in this organization.", requestId);

  const slug = await generateUniqueSlug(name.trim(), async (candidate) => !!(await prisma.campaignTeam.findUnique({ where: { slug: candidate } })));

  const team = await prisma.campaignTeam.create({ data: { churchId, fundraisingCampaignId, name: name.trim(), slug } });

  const givingLinkId = await provisionCampaignGivingLink({
    churchId,
    internalName: `${campaign.name} — Team: ${team.name} (API)`,
    publicTitle: team.name,
    ownerUserId: null,
    fundraisingCampaignId,
    campaignTeamId: team.id,
  });
  const updated = await prisma.campaignTeam.update({ where: { id: team.id }, data: { givingLinkId } });

  try {
    await emitEvent({ type: "team.created", churchId, data: { teamId: team.id, name: team.name, campaignId: fundraisingCampaignId, source: "api" } });
  } catch (err) {
    console.error("Failed to emit team.created event (API):", err);
  }

  return apiSuccess(updated, requestId);
});
