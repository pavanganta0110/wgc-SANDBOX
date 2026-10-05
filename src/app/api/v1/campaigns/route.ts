import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/api/withApiAuth";
import { apiSuccess, apiError, parsePagination, paginationMeta } from "@/lib/api/response";
import { findIdempotentReplay, storeIdempotentResponse } from "@/lib/api/idempotency";
import { generateUniqueSlug } from "@/lib/campaigns/slugs";
import { provisionCampaignGivingLink } from "@/lib/campaigns/campaignGivingLinks";
import { getCampaignRaisedCents } from "@/lib/campaigns/campaignTotals";
import { emitEvent } from "@/lib/events/emitEvent";

export const GET = withApiAuth("campaigns:read", async (req, auth, requestId) => {
  const { searchParams } = new URL(req.url);
  const { limit, cursor } = parsePagination(searchParams);
  const status = searchParams.get("status") || undefined;

  const campaigns = await prisma.fundraisingCampaign.findMany({
    where: { churchId: auth.churchId, archivedAt: null, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const { page, hasMore, nextCursor } = paginationMeta(campaigns, limit);
  const withTotals = await Promise.all(page.map(async (c) => ({ ...c, raisedCents: await getCampaignRaisedCents(auth.churchId, c.id) })));
  return apiSuccess(withTotals, requestId, { hasMore, nextCursor });
});

export const POST = withApiAuth("campaigns:write", async (req, auth, requestId) => {
  const idempotencyKey = req.headers.get("idempotency-key");
  const path = new URL(req.url).pathname;
  if (idempotencyKey) {
    const replay = await findIdempotentReplay(auth.apiKeyId, idempotencyKey, "POST", path);
    if (replay) return replay;
  }

  const body = await req.json().catch(() => ({}));
  const { name, description, goalAmountCents } = body;
  if (!name || typeof name !== "string" || !name.trim()) {
    return apiError("validation_error", "`name` is required.", requestId);
  }

  const churchId = auth.churchId;
  const slug = await generateUniqueSlug(name.trim(), async (candidate) => !!(await prisma.fundraisingCampaign.findUnique({ where: { slug: candidate } })));

  const campaign = await prisma.fundraisingCampaign.create({
    data: {
      churchId,
      name: name.trim(),
      description: typeof description === "string" ? description.trim() : null,
      slug,
      goalAmountCents: typeof goalAmountCents === "number" ? goalAmountCents : null,
      status: "DRAFT",
    },
  });

  const givingLinkId = await provisionCampaignGivingLink({
    churchId,
    internalName: `${campaign.name} — Campaign (API)`,
    publicTitle: campaign.name,
    ownerUserId: null,
    fundraisingCampaignId: campaign.id,
  });
  const updated = await prisma.fundraisingCampaign.update({ where: { id: campaign.id }, data: { givingLinkId } });

  try {
    await emitEvent({ type: "campaign.created", churchId, data: { campaignId: campaign.id, name: campaign.name, slug: campaign.slug, source: "api" } });
  } catch (err) {
    console.error("Failed to emit campaign.created event (API):", err);
  }

  const response = apiSuccess(updated, requestId);
  if (idempotencyKey) {
    const bodyForCache = await response.clone().json();
    await storeIdempotentResponse(auth.apiKeyId, idempotencyKey, "POST", path, response.status, bodyForCache);
  }
  return response;
});
