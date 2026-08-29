import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";
import { computeCampaignProgress } from "@/lib/pledges/pledgeFulfillment";
import { loadPledgesList } from "@/lib/pledges/loadPledgesList";
import { logDashboardAction } from "@/lib/dashboardAudit";

export async function GET(_req: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return toSafeErrorResponse(err.message, err.status);
    throw err;
  }
  try {
    requirePermission(auth, "canViewPledges");
  } catch (err) {
    if (err instanceof ForbiddenError) return toSafeErrorResponse(err.message, 403);
    throw err;
  }

  const { campaignId } = await params;
  const campaign = await prisma.pledgeCampaign.findFirst({ where: { id: campaignId, churchId: auth.churchId } });
  if (!campaign) return toSafeErrorResponse("Campaign not found", 404);

  const [progress, pledges] = await Promise.all([
    computeCampaignProgress(auth.churchId, campaignId),
    loadPledgesList(auth.churchId, { pledgeCampaignId: campaignId }),
  ]);

  return NextResponse.json({ campaign, progress, pledges });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return toSafeErrorResponse(err.message, err.status);
    throw err;
  }
  try {
    requirePermission(auth, "canEditPledgeCampaign");
  } catch (err) {
    if (err instanceof ForbiddenError) return toSafeErrorResponse(err.message, 403);
    throw err;
  }

  const { campaignId } = await params;
  const existing = await prisma.pledgeCampaign.findFirst({ where: { id: campaignId, churchId: auth.churchId } });
  if (!existing) return toSafeErrorResponse("Campaign not found", 404);

  const body = await req.json().catch(() => ({}));
  const { name, description, goalAmountCents, startDate, endDate, publicSlug } = body;

  if (goalAmountCents != null && (!Number.isFinite(goalAmountCents) || goalAmountCents < 0)) {
    return toSafeErrorResponse("Goal amount must be a valid non-negative amount", 400);
  }
  if (publicSlug != null) {
    if (typeof publicSlug !== "string" || !/^[a-zA-Z0-9-]{3,60}$/.test(publicSlug)) {
      return toSafeErrorResponse("Public slug must be 3-60 letters, numbers, or hyphens", 400);
    }
    const slugTaken = await prisma.pledgeCampaign.findFirst({ where: { publicSlug, NOT: { id: campaignId } } });
    if (slugTaken) return toSafeErrorResponse("This public URL is already in use", 409);
  }

  const campaign = await prisma.pledgeCampaign.update({
    where: { id: campaignId },
    data: {
      ...(name !== undefined ? { name: String(name).trim() } : {}),
      ...(description !== undefined ? { description: description?.trim() || null } : {}),
      ...(goalAmountCents !== undefined ? { goalAmountCents } : {}),
      ...(startDate !== undefined ? { startDate: startDate ? new Date(startDate) : null } : {}),
      ...(endDate !== undefined ? { endDate: endDate ? new Date(endDate) : null } : {}),
      ...(publicSlug !== undefined ? { publicSlug: publicSlug || null } : {}),
    },
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "pledge_campaign.updated",
    entityType: "pledge_campaign",
    entityId: campaign.id,
    metadata: { fields: Object.keys(body) },
    req,
  });

  return NextResponse.json({ campaign });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return toSafeErrorResponse(err.message, err.status);
    throw err;
  }
  try {
    requirePermission(auth, "canArchivePledgeCampaign");
  } catch (err) {
    if (err instanceof ForbiddenError) return toSafeErrorResponse(err.message, 403);
    throw err;
  }

  const { campaignId } = await params;
  const existing = await prisma.pledgeCampaign.findFirst({ where: { id: campaignId, churchId: auth.churchId } });
  if (!existing) return toSafeErrorResponse("Campaign not found", 404);

  const campaign = await prisma.pledgeCampaign.update({ where: { id: campaignId }, data: { status: "ARCHIVED" } });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "pledge_campaign.archived",
    entityType: "pledge_campaign",
    entityId: campaign.id,
    req,
  });

  return NextResponse.json({ campaign });
}
