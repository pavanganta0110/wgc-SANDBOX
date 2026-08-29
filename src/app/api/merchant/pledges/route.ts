import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";
import { loadPledgesList } from "@/lib/pledges/loadPledgesList";
import { logDashboardAction } from "@/lib/dashboardAudit";

export async function GET(req: Request) {
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

  const { searchParams } = new URL(req.url);
  const pledges = await loadPledgesList(auth.churchId, {
    pledgeCampaignId: searchParams.get("campaignId") || undefined,
    donorId: searchParams.get("donorId") || undefined,
    status: searchParams.get("status") || undefined,
  });
  return NextResponse.json({ pledges });
}

export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return toSafeErrorResponse(err.message, err.status);
    throw err;
  }
  try {
    requirePermission(auth, "canCreatePledge");
  } catch (err) {
    if (err instanceof ForbiddenError) return toSafeErrorResponse(err.message, 403);
    throw err;
  }

  const body = await req.json().catch(() => ({}));
  const { pledgeCampaignId, donorId, isAnonymous, pledgeAmountCents, unitCount, dueDate, notes } = body;

  if (!pledgeCampaignId || typeof pledgeCampaignId !== "string") {
    return toSafeErrorResponse("pledgeCampaignId is required", 400);
  }
  const campaign = await prisma.pledgeCampaign.findFirst({ where: { id: pledgeCampaignId, churchId: auth.churchId } });
  if (!campaign) return toSafeErrorResponse("Campaign not found", 404);

  let resolvedAmountCents = pledgeAmountCents;
  if (campaign.unitAmountCents != null && unitCount != null) {
    if (!Number.isFinite(unitCount) || unitCount <= 0) {
      return toSafeErrorResponse("Unit count must be a positive number", 400);
    }
    resolvedAmountCents = Math.round(campaign.unitAmountCents * unitCount);
  }
  if (!Number.isFinite(resolvedAmountCents) || resolvedAmountCents <= 0) {
    return toSafeErrorResponse("Pledge amount must be a valid positive amount", 400);
  }

  let donor = null;
  if (donorId) {
    donor = await prisma.donor.findFirst({ where: { id: donorId, churchId: auth.churchId, archivedAt: null } });
    if (!donor) return toSafeErrorResponse("Donor not found", 404);
  }
  if (!donor && !isAnonymous) {
    return toSafeErrorResponse("Select a donor, or mark this pledge as anonymous", 400);
  }

  const attributedUserId = auth.userId;

  const pledge = await prisma.pledge.create({
    data: {
      churchId: auth.churchId,
      pledgeCampaignId,
      donorId: donor?.id ?? null,
      donorMatchStatus: donor ? "MATCHED" : "ANONYMOUS",
      isAnonymous: Boolean(isAnonymous),
      pledgeAmountCents: resolvedAmountCents,
      unitCount: unitCount ?? null,
      dueDate: dueDate ? new Date(dueDate) : null,
      notes: notes?.trim() || null,
      source: "MERCHANT_ENTERED",
      createdByUserId: auth.userId,
      attributedUserId,
    },
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "pledge.created",
    entityType: "pledge",
    entityId: pledge.id,
    metadata: { pledgeCampaignId, pledgeAmountCents: resolvedAmountCents },
    req,
  });

  return NextResponse.json({ pledge });
}
