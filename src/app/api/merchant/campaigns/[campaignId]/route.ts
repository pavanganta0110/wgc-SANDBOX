import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { getCampaignRaisedCents } from "@/lib/campaigns/campaignTotals";
import { emitEvent } from "@/lib/events/emitEvent";

const VALID_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "COMPLETED"];

export async function GET(req: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canViewFundraisingCampaigns");
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const campaign = await prisma.fundraisingCampaign.findFirst({
    where: { id: campaignId, churchId: auth.churchId },
  });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const raisedCents = await getCampaignRaisedCents(auth.churchId, campaign.id);
  return NextResponse.json({ campaign: { ...campaign, raisedCents } });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canEditFundraisingCampaign");
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const existing = await prisma.fundraisingCampaign.findFirst({
    where: { id: campaignId, churchId: auth.churchId },
  });
  if (!existing) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const body = await req.json();
  const { name, description, imageUrl, startDate, endDate, goalAmountCents, status, leaderboardEnabled, publiclyIndexable, fundraiserSelfEditEnabled } = body;

  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const updated = await prisma.fundraisingCampaign.update({
    where: { id: campaignId },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(description !== undefined ? { description: description?.trim() || null } : {}),
      ...(imageUrl !== undefined ? { imageUrl: imageUrl?.trim() || null } : {}),
      ...(startDate !== undefined ? { startDate: startDate ? new Date(startDate) : null } : {}),
      ...(endDate !== undefined ? { endDate: endDate ? new Date(endDate) : null } : {}),
      ...(goalAmountCents !== undefined ? { goalAmountCents } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(leaderboardEnabled !== undefined ? { leaderboardEnabled: !!leaderboardEnabled } : {}),
      ...(publiclyIndexable !== undefined ? { publiclyIndexable: !!publiclyIndexable } : {}),
      ...(fundraiserSelfEditEnabled !== undefined ? { fundraiserSelfEditEnabled: !!fundraiserSelfEditEnabled } : {}),
    },
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    action: "fundraising_campaign.updated",
    entityType: "FundraisingCampaign",
    entityId: campaignId,
    metadata: { changes: Object.keys(body) },
    req,
  });

  try {
    const justCompleted = status === "COMPLETED" && existing.status !== "COMPLETED";
    await emitEvent({
      type: justCompleted ? "campaign.completed" : "campaign.updated",
      churchId: auth.churchId,
      data: { campaignId, changes: Object.keys(body) },
    });
  } catch (err) {
    console.error("Failed to emit campaign update event:", err);
  }

  return NextResponse.json({ campaign: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canArchiveFundraisingCampaign");
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const existing = await prisma.fundraisingCampaign.findFirst({
    where: { id: campaignId, churchId: auth.churchId },
  });
  if (!existing) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  await prisma.fundraisingCampaign.update({
    where: { id: campaignId },
    data: { archivedAt: new Date(), status: "COMPLETED" },
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    action: "fundraising_campaign.archived",
    entityType: "FundraisingCampaign",
    entityId: campaignId,
    req,
  });

  try {
    const justCompleted = existing.status !== "COMPLETED";
    await emitEvent({ type: justCompleted ? "campaign.completed" : "campaign.updated", churchId: auth.churchId, data: { campaignId, archived: true } });
  } catch (err) {
    console.error("Failed to emit campaign archive event:", err);
  }

  return NextResponse.json({ ok: true });
}
