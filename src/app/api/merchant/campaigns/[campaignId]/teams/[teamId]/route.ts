import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { getTeamRaisedCents } from "@/lib/campaigns/campaignTotals";
import { emitEvent } from "@/lib/events/emitEvent";

export async function PATCH(req: Request, { params }: { params: Promise<{ campaignId: string; teamId: string }> }) {
  const { campaignId, teamId } = await params;
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canManageCampaignRoster");
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const existing = await prisma.campaignTeam.findFirst({ where: { id: teamId, churchId: auth.churchId, fundraisingCampaignId: campaignId } });
  if (!existing) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  const body = await req.json();
  const { name, goalAmountCents, imageUrl } = body;

  const updated = await prisma.campaignTeam.update({
    where: { id: teamId },
    data: {
      ...(name !== undefined ? { name: String(name).trim() } : {}),
      ...(goalAmountCents !== undefined ? { goalAmountCents } : {}),
      ...(imageUrl !== undefined ? { imageUrl: imageUrl ? String(imageUrl).trim() : null } : {}),
    },
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    action: "campaign_team.updated",
    entityType: "CampaignTeam",
    entityId: teamId,
    metadata: { changes: Object.keys(body) },
    req,
  });

  try {
    await emitEvent({ type: "team.updated", churchId: auth.churchId, data: { teamId, campaignId, changes: Object.keys(body) } });
  } catch (err) {
    console.error("Failed to emit team.updated event:", err);
  }

  const raisedCents = await getTeamRaisedCents(auth.churchId, teamId);
  return NextResponse.json({ team: { ...updated, raisedCents } });
}
