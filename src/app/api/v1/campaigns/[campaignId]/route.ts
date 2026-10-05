import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/api/withApiAuth";
import { apiSuccess, apiError } from "@/lib/api/response";
import { getCampaignRaisedCents } from "@/lib/campaigns/campaignTotals";
import { emitEvent } from "@/lib/events/emitEvent";

const VALID_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "COMPLETED"];

export const GET = withApiAuth<{ params: Promise<{ campaignId: string }> }>("campaigns:read", async (req, auth, requestId, { params }) => {
  const { campaignId } = await params;

  const campaign = await prisma.fundraisingCampaign.findFirst({ where: { id: campaignId, churchId: auth.churchId } });
  if (!campaign) return apiError("not_found_error", "Campaign not found.", requestId);

  const raisedCents = await getCampaignRaisedCents(auth.churchId, campaign.id);
  return apiSuccess({ ...campaign, raisedCents }, requestId);
});

export const PATCH = withApiAuth<{ params: Promise<{ campaignId: string }> }>("campaigns:write", async (req, auth, requestId, { params }) => {
  const { campaignId } = await params;

  const existing = await prisma.fundraisingCampaign.findFirst({ where: { id: campaignId, churchId: auth.churchId } });
  if (!existing) return apiError("not_found_error", "Campaign not found.", requestId);

  const body = await req.json().catch(() => ({}));
  const { name, description, goalAmountCents, status } = body;

  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return apiError("validation_error", "Invalid status.", requestId);
  }

  const updated = await prisma.fundraisingCampaign.update({
    where: { id: campaignId },
    data: {
      ...(name !== undefined ? { name: String(name).trim() } : {}),
      ...(description !== undefined ? { description: description ? String(description).trim() : null } : {}),
      ...(goalAmountCents !== undefined ? { goalAmountCents } : {}),
      ...(status !== undefined ? { status } : {}),
    },
  });

  try {
    const justCompleted = status === "COMPLETED" && existing.status !== "COMPLETED";
    await emitEvent({ type: justCompleted ? "campaign.completed" : "campaign.updated", churchId: auth.churchId, data: { campaignId, changes: Object.keys(body), source: "api" } });
  } catch (err) {
    console.error("Failed to emit campaign update event (API):", err);
  }

  const raisedCents = await getCampaignRaisedCents(auth.churchId, updated.id);
  return apiSuccess({ ...updated, raisedCents }, requestId);
});
