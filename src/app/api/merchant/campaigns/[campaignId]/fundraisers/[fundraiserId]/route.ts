import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { getFundraiserRaisedCents } from "@/lib/campaigns/campaignTotals";
import { emitEvent } from "@/lib/events/emitEvent";

export async function PATCH(req: Request, { params }: { params: Promise<{ campaignId: string; fundraiserId: string }> }) {
  const { campaignId, fundraiserId } = await params;
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canManageCampaignRoster");
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const existing = await prisma.campaignFundraiser.findFirst({ where: { id: fundraiserId, churchId: auth.churchId, fundraisingCampaignId: campaignId } });
  if (!existing) return NextResponse.json({ error: "Fundraiser not found" }, { status: 404 });

  const body = await req.json();
  const { displayName, personalStory, imageUrl, goalAmountCents, campaignTeamId } = body;

  let resolvedTeamId: string | null | undefined = undefined;
  if (campaignTeamId !== undefined) {
    if (campaignTeamId === null) {
      resolvedTeamId = null;
    } else {
      const team = await prisma.campaignTeam.findFirst({ where: { id: campaignTeamId, churchId: auth.churchId, fundraisingCampaignId: campaignId } });
      if (!team) return NextResponse.json({ error: "Team not found on this campaign" }, { status: 400 });
      resolvedTeamId = team.id;
    }
  }

  const updated = await prisma.campaignFundraiser.update({
    where: { id: fundraiserId },
    data: {
      ...(displayName !== undefined ? { displayName: String(displayName).trim() } : {}),
      ...(personalStory !== undefined ? { personalStory: personalStory ? String(personalStory).trim() : null } : {}),
      ...(imageUrl !== undefined ? { imageUrl: imageUrl ? String(imageUrl).trim() : null } : {}),
      ...(goalAmountCents !== undefined ? { goalAmountCents } : {}),
      ...(resolvedTeamId !== undefined ? { campaignTeamId: resolvedTeamId } : {}),
    },
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    action: "campaign_fundraiser.updated",
    entityType: "CampaignFundraiser",
    entityId: fundraiserId,
    metadata: { changes: Object.keys(body) },
    req,
  });

  try {
    await emitEvent({ type: "fundraiser.updated", churchId: auth.churchId, data: { fundraiserId, campaignId, changes: Object.keys(body) } });
  } catch (err) {
    console.error("Failed to emit fundraiser.updated event:", err);
  }

  const raisedCents = await getFundraiserRaisedCents(auth.churchId, fundraiserId);
  return NextResponse.json({ fundraiser: { ...updated, raisedCents } });
}
