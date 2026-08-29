import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";
import { loadPledgeCampaignsList } from "@/lib/pledges/loadPledgeCampaignsList";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { generatePublicSlug } from "@/lib/givingLinks/validation";

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
  const status = searchParams.get("status") || undefined;
  const campaigns = await loadPledgeCampaignsList(auth.churchId, { status });
  return NextResponse.json({ campaigns });
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
    requirePermission(auth, "canCreatePledgeCampaign");
  } catch (err) {
    if (err instanceof ForbiddenError) return toSafeErrorResponse(err.message, 403);
    throw err;
  }

  const body = await req.json().catch(() => ({}));
  const { name, description, campaignType, fundId, goalAmountCents, startDate, endDate, unitLabel, unitAmountCents, givingLinkId, publish } = body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return toSafeErrorResponse("Campaign name is required", 400);
  }
  if (goalAmountCents != null && (!Number.isFinite(goalAmountCents) || goalAmountCents < 0)) {
    return toSafeErrorResponse("Goal amount must be a valid non-negative amount", 400);
  }
  if (unitAmountCents != null && (!Number.isFinite(unitAmountCents) || unitAmountCents < 0)) {
    return toSafeErrorResponse("Per-unit amount must be a valid non-negative amount", 400);
  }

  let fund = null;
  if (fundId) {
    fund = await prisma.fund.findFirst({ where: { id: fundId, churchId: auth.churchId } });
    if (!fund) return toSafeErrorResponse("Fund not found", 404);
  }

  let givingLink = null;
  if (givingLinkId) {
    givingLink = await prisma.givingLink.findFirst({ where: { id: givingLinkId, churchId: auth.churchId } });
    if (!givingLink) return toSafeErrorResponse("Giving link not found", 404);
  }

  let publicSlug: string | null = null;
  if (publish) {
    publicSlug = generatePublicSlug();
    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await prisma.pledgeCampaign.findUnique({ where: { publicSlug } });
      if (!existing) break;
      publicSlug = generatePublicSlug();
    }
  }

  const campaign = await prisma.pledgeCampaign.create({
    data: {
      churchId: auth.churchId,
      name: name.trim(),
      description: description?.trim() || null,
      campaignType: typeof campaignType === "string" ? campaignType : "GENERAL",
      fundId: fund?.id ?? null,
      fundName: fund?.name ?? null,
      goalAmountCents: goalAmountCents ?? null,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      unitLabel: unitLabel?.trim() || null,
      unitAmountCents: unitAmountCents ?? null,
      publicSlug,
      givingLinkId: givingLink?.id ?? null,
      givingLinkSlug: givingLink?.publicSlug ?? null,
      createdByUserId: auth.userId,
    },
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "pledge_campaign.created",
    entityType: "pledge_campaign",
    entityId: campaign.id,
    metadata: { name: campaign.name, goalAmountCents: campaign.goalAmountCents },
    req,
  });

  return NextResponse.json({ campaign });
}
