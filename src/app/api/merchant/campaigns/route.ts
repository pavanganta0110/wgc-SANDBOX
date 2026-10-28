import { NextResponse } from "next/server";
import { goalAmountCentsError } from "@/lib/utils/amountLimits";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { generateUniqueSlug } from "@/lib/campaigns/slugs";
import { parseDisplayUpdate } from "@/lib/campaigns/display";
import { isValidPageBackground, isValidWallBackground } from "@/lib/campaigns/backgrounds";
import { provisionCampaignGivingLink } from "@/lib/campaigns/campaignGivingLinks";
import { getCampaignRaisedCents } from "@/lib/campaigns/campaignTotals";
import { emitEvent } from "@/lib/events/emitEvent";

export async function GET(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canViewFundraisingCampaigns");
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || undefined;

  const campaigns = await prisma.fundraisingCampaign.findMany({
    where: { churchId: auth.churchId, archivedAt: null, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
  });

  const withTotals = await Promise.all(
    campaigns.map(async (c) => ({
      ...c,
      raisedCents: await getCampaignRaisedCents(auth.churchId, c.id),
    }))
  );

  return NextResponse.json({ campaigns: withTotals });
}

export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canCreateFundraisingCampaign");
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const body = await req.json();
  const { name, description, imageUrl, startDate, endDate, goalAmountCents, leaderboardEnabled, publiclyIndexable, pageBackground, wallBackground } = body;
  const goalProblem = goalAmountCentsError(goalAmountCents);
  if (goalProblem) return NextResponse.json({ error: goalProblem }, { status: 400 });

  if (pageBackground !== undefined && !isValidPageBackground(pageBackground)) {
    return NextResponse.json({ error: "Invalid page background" }, { status: 400 });
  }
  if (wallBackground !== undefined && !isValidWallBackground(wallBackground)) {
    return NextResponse.json({ error: "Invalid live wall background" }, { status: 400 });
  }

  const display = parseDisplayUpdate(body);
  if (display.error) return NextResponse.json({ error: display.error }, { status: 400 });

  if (!name?.trim()) {
    return NextResponse.json({ error: "Campaign name is required" }, { status: 400 });
  }
  if (goalAmountCents != null && (typeof goalAmountCents !== "number" || goalAmountCents < 0)) {
    return NextResponse.json({ error: "Goal amount must be a positive number" }, { status: 400 });
  }

  const churchId = auth.churchId;
  const slug = await generateUniqueSlug(name.trim(), async (candidate) => {
    const existing = await prisma.fundraisingCampaign.findUnique({ where: { slug: candidate } });
    return !!existing;
  });

  const campaign = await prisma.fundraisingCampaign.create({
    data: {
      churchId,
      name: name.trim(),
      description: description?.trim() || null,
      imageUrl: imageUrl?.trim() || null,
      ...(pageBackground !== undefined ? { pageBackground } : {}),
      ...(wallBackground !== undefined ? { wallBackground } : {}),
      ...display.data,
      slug,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      goalAmountCents: goalAmountCents ?? null,
      status: "DRAFT",
      leaderboardEnabled: leaderboardEnabled ?? true,
      publiclyIndexable: publiclyIndexable ?? true,
      createdByUserId: auth.userId,
    },
  });

  const givingLinkId = await provisionCampaignGivingLink({
    churchId,
    internalName: `${campaign.name} — Campaign`,
    publicTitle: campaign.name,
    ownerUserId: auth.userId,
    fundraisingCampaignId: campaign.id,
  });

  const updated = await prisma.fundraisingCampaign.update({
    where: { id: campaign.id },
    data: { givingLinkId },
  });

  await logDashboardAction({
    churchId,
    actorUserId: auth.userId,
    action: "fundraising_campaign.created",
    entityType: "FundraisingCampaign",
    entityId: campaign.id,
    metadata: { name: campaign.name, slug: campaign.slug },
    req,
  });

  try {
    await emitEvent({ type: "campaign.created", churchId, data: { campaignId: campaign.id, name: campaign.name, slug: campaign.slug, goalAmountCents: campaign.goalAmountCents } });
  } catch (err) {
    console.error("Failed to emit campaign.created event:", err);
  }

  return NextResponse.json({ campaign: updated });
}
