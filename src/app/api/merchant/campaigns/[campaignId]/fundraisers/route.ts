import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { generateUniqueSlug } from "@/lib/campaigns/slugs";
import { provisionCampaignGivingLink } from "@/lib/campaigns/campaignGivingLinks";
import { getFundraiserRaisedCents } from "@/lib/campaigns/campaignTotals";
import { emitEvent } from "@/lib/events/emitEvent";

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
    select: { id: true },
  });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const fundraisers = await prisma.campaignFundraiser.findMany({
    where: { churchId: auth.churchId, fundraisingCampaignId: campaignId },
    orderBy: { createdAt: "desc" },
  });

  const withTotals = await Promise.all(
    fundraisers.map(async (f) => ({ ...f, raisedCents: await getFundraiserRaisedCents(auth.churchId, f.id) }))
  );

  return NextResponse.json({ fundraisers: withTotals });
}

export async function POST(req: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canManageCampaignRoster");
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const churchId = auth.churchId;
  const campaign = await prisma.fundraisingCampaign.findFirst({
    where: { id: campaignId, churchId },
    select: { id: true, name: true },
  });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const body = await req.json();
  const { displayName, email, goalAmountCents, imageUrl, personalStory, campaignTeamId } = body;
  if (!displayName?.trim()) {
    return NextResponse.json({ error: "Fundraiser name is required" }, { status: 400 });
  }

  let team: { id: string } | null = null;
  if (campaignTeamId) {
    team = await prisma.campaignTeam.findFirst({
      where: { id: campaignTeamId, churchId, fundraisingCampaignId: campaignId },
      select: { id: true },
    });
    if (!team) return NextResponse.json({ error: "Team not found" }, { status: 400 });
  }

  const slug = await generateUniqueSlug(displayName.trim(), async (candidate) => {
    const existing = await prisma.campaignFundraiser.findUnique({ where: { slug: candidate } });
    return !!existing;
  });

  const fundraiser = await prisma.campaignFundraiser.create({
    data: {
      churchId,
      fundraisingCampaignId: campaignId,
      campaignTeamId: team?.id ?? null,
      displayName: displayName.trim(),
      slug,
      email: email?.trim() || null,
      personalStory: personalStory?.trim() || null,
      imageUrl: imageUrl?.trim() || null,
      goalAmountCents: goalAmountCents ?? null,
      createdByUserId: auth.userId,
    },
  });

  const givingLinkId = await provisionCampaignGivingLink({
    churchId,
    internalName: `${campaign.name} — Fundraiser: ${fundraiser.displayName}`,
    publicTitle: fundraiser.displayName,
    ownerUserId: auth.userId,
    fundraisingCampaignId: campaignId,
    campaignTeamId: team?.id ?? null,
    campaignFundraiserId: fundraiser.id,
  });

  const updated = await prisma.campaignFundraiser.update({ where: { id: fundraiser.id }, data: { givingLinkId } });

  await logDashboardAction({
    churchId,
    actorUserId: auth.userId,
    action: "campaign_fundraiser.created",
    entityType: "CampaignFundraiser",
    entityId: fundraiser.id,
    metadata: { displayName: fundraiser.displayName, campaignId },
    req,
  });

  try {
    await emitEvent({ type: "fundraiser.created", churchId, data: { fundraiserId: fundraiser.id, displayName: fundraiser.displayName, campaignId, campaignTeamId: team?.id ?? null } });
  } catch (err) {
    console.error("Failed to emit fundraiser.created event:", err);
  }

  return NextResponse.json({ fundraiser: updated });
}
