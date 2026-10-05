import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { generateUniqueSlug } from "@/lib/campaigns/slugs";
import { provisionCampaignGivingLink } from "@/lib/campaigns/campaignGivingLinks";
import { getTeamRaisedCents } from "@/lib/campaigns/campaignTotals";
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

  const teams = await prisma.campaignTeam.findMany({
    where: { churchId: auth.churchId, fundraisingCampaignId: campaignId },
    orderBy: { createdAt: "desc" },
  });

  const withTotals = await Promise.all(
    teams.map(async (t) => ({ ...t, raisedCents: await getTeamRaisedCents(auth.churchId, t.id) }))
  );

  return NextResponse.json({ teams: withTotals });
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
  const { name, goalAmountCents, imageUrl } = body;
  if (!name?.trim()) {
    return NextResponse.json({ error: "Team name is required" }, { status: 400 });
  }

  const slug = await generateUniqueSlug(name.trim(), async (candidate) => {
    const existing = await prisma.campaignTeam.findUnique({ where: { slug: candidate } });
    return !!existing;
  });

  const team = await prisma.campaignTeam.create({
    data: {
      churchId,
      fundraisingCampaignId: campaignId,
      name: name.trim(),
      slug,
      goalAmountCents: goalAmountCents ?? null,
      imageUrl: imageUrl?.trim() || null,
      createdByUserId: auth.userId,
    },
  });

  const givingLinkId = await provisionCampaignGivingLink({
    churchId,
    internalName: `${campaign.name} — Team: ${team.name}`,
    publicTitle: team.name,
    ownerUserId: auth.userId,
    fundraisingCampaignId: campaignId,
    campaignTeamId: team.id,
  });

  const updated = await prisma.campaignTeam.update({ where: { id: team.id }, data: { givingLinkId } });

  await logDashboardAction({
    churchId,
    actorUserId: auth.userId,
    action: "campaign_team.created",
    entityType: "CampaignTeam",
    entityId: team.id,
    metadata: { name: team.name, campaignId },
    req,
  });

  try {
    await emitEvent({ type: "team.created", churchId, data: { teamId: team.id, name: team.name, campaignId } });
  } catch (err) {
    console.error("Failed to emit team.created event:", err);
  }

  return NextResponse.json({ team: updated });
}
