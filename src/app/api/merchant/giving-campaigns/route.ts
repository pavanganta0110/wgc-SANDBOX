import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { generateCampaignTrackingToken } from "@/lib/giving/campaignTemplate";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { isSmsConfigured } from "@/lib/sms/sendText";
import { isSmsAddonActive } from "@/lib/billing/smsAddonSubscriptionService";

const CHANNELS = new Set(["EMAIL", "TEXT"]);

/** List this church's campaigns, most recent first, with a lightweight
 * recipient-status rollup (no per-recipient rows — see [id]/route.ts for
 * that) so the list page doesn't pull every recipient for every campaign. */
export async function GET() {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  if (!getDonorPermissions(auth.rawRole).canView) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const campaigns = await prisma.givingCampaign.findMany({
    where: { churchId: auth.churchId },
    orderBy: { createdAt: "desc" },
  });

  const counts = await prisma.givingCampaignRecipient.groupBy({
    by: ["campaignId", "sendStatus"],
    where: { churchId: auth.churchId, campaignId: { in: campaigns.map((c) => c.id) } },
    _count: true,
  });
  const paidCounts = await prisma.givingCampaignRecipient.groupBy({
    by: ["campaignId"],
    where: { churchId: auth.churchId, campaignId: { in: campaigns.map((c) => c.id) }, paidAt: { not: null } },
    _count: true,
  });

  const result = campaigns.map((c) => {
    const forCampaign = counts.filter((row) => row.campaignId === c.id);
    const total = forCampaign.reduce((sum, row) => sum + row._count, 0);
    const sent = forCampaign.filter((row) => row.sendStatus === "SENT").reduce((sum, row) => sum + row._count, 0);
    const failed = forCampaign.filter((row) => row.sendStatus === "FAILED").reduce((sum, row) => sum + row._count, 0);
    const paid = paidCounts.find((row) => row.campaignId === c.id)?._count ?? 0;
    return { ...c, recipientCounts: { total, sent, failed, paid } };
  });

  return NextResponse.json({ campaigns: result });
}

/** Creates a DRAFT campaign and seeds one GivingCampaignRecipient per
 * requested donor. Never sends anything — see [id]/send-chunk/route.ts. A
 * donor missing the contact info the chosen channel needs (email for
 * EMAIL, a US-parseable phone for TEXT) is skipped silently, which is why
 * the response reports back how many of the requested donors actually
 * became real recipients. */
export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getDonorPermissions(auth.rawRole);
  // Sending a bulk message to the donor list is a donor-communication
  // action, not just viewing — same tier as generating/sending statements.
  if (!permissions.canView || !permissions.canSendStatements) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const requestedGivingLinkId = typeof body.givingLinkId === "string" ? body.givingLinkId : "";
  const fundraisingCampaignId = typeof body.fundraisingCampaignId === "string" ? body.fundraisingCampaignId : "";
  const campaignTeamId = typeof body.campaignTeamId === "string" ? body.campaignTeamId : "";
  const campaignFundraiserId = typeof body.campaignFundraiserId === "string" ? body.campaignFundraiserId : "";
  const pledgeCampaignId = typeof body.pledgeCampaignId === "string" ? body.pledgeCampaignId : "";
  const channel = typeof body.channel === "string" && CHANNELS.has(body.channel) ? body.channel : "EMAIL";
  const emailSubject = typeof body.emailSubject === "string" ? body.emailSubject.trim() : "";
  const emailBodyTemplate = typeof body.emailBodyTemplate === "string" ? body.emailBodyTemplate : "";
  const textBodyTemplate = typeof body.textBodyTemplate === "string" ? body.textBodyTemplate.trim() : "";
  const donorIds: string[] = Array.isArray(body.donorIds) ? body.donorIds.filter((id: unknown) => typeof id === "string") : [];

  if (channel === "EMAIL" && (!emailSubject || !emailBodyTemplate)) {
    return NextResponse.json({ error: "A subject and message are required." }, { status: 400 });
  }
  if (channel === "TEXT" && !textBodyTemplate) {
    return NextResponse.json({ error: "A message is required." }, { status: 400 });
  }
  if (channel === "TEXT" && !isSmsConfigured()) {
    return NextResponse.json({ error: "Text messaging is not configured for this organization." }, { status: 400 });
  }
  if (channel === "TEXT" && !(await isSmsAddonActive(auth.churchId))) {
    return NextResponse.json({ error: "Text messaging is a paid add-on — subscribe from Billing Plan to send texts." }, { status: 402 });
  }
  if (!name) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }
  if (donorIds.length === 0) {
    return NextResponse.json({ error: "Select at least one donor." }, { status: 400 });
  }
  if ((fundraisingCampaignId || campaignTeamId || campaignFundraiserId) && pledgeCampaignId) {
    return NextResponse.json({ error: "Choose either a fundraising campaign or a pledge campaign, not both." }, { status: 400 });
  }

  // Resolves to this record's OWN dedicated giving link, never the
  // requestedGivingLinkId the client might also send — see the comment on
  // GivingCampaign.givingLinkId in schema.prisma for why this can never be
  // an independent choice once a tie-in is picked. Falls through to the
  // plain requestedGivingLinkId only when no tie-in was selected at all,
  // preserving the original, ordinary "just pick a giving link" flow.
  let resolvedGivingLinkId = requestedGivingLinkId;
  let resolvedFundraisingCampaignId: string | null = null;
  let resolvedCampaignTeamId: string | null = null;
  let resolvedCampaignFundraiserId: string | null = null;
  let resolvedPledgeCampaignId: string | null = null;

  if (campaignFundraiserId) {
    const fundraiser = await prisma.campaignFundraiser.findFirst({ where: { id: campaignFundraiserId, churchId: auth.churchId } });
    if (!fundraiser) return NextResponse.json({ error: "Fundraiser not found." }, { status: 404 });
    if (campaignTeamId && fundraiser.campaignTeamId !== campaignTeamId) {
      return NextResponse.json({ error: "This fundraiser is not on the selected team." }, { status: 400 });
    }
    if (fundraisingCampaignId && fundraiser.fundraisingCampaignId !== fundraisingCampaignId) {
      return NextResponse.json({ error: "This fundraiser is not on the selected campaign." }, { status: 400 });
    }
    if (!fundraiser.givingLinkId) {
      return NextResponse.json({ error: "This fundraiser doesn't have a giving link set up yet." }, { status: 400 });
    }
    resolvedCampaignFundraiserId = fundraiser.id;
    resolvedCampaignTeamId = fundraiser.campaignTeamId;
    resolvedFundraisingCampaignId = fundraiser.fundraisingCampaignId;
    resolvedGivingLinkId = fundraiser.givingLinkId;
  } else if (campaignTeamId) {
    const team = await prisma.campaignTeam.findFirst({ where: { id: campaignTeamId, churchId: auth.churchId } });
    if (!team) return NextResponse.json({ error: "Team not found." }, { status: 404 });
    if (fundraisingCampaignId && team.fundraisingCampaignId !== fundraisingCampaignId) {
      return NextResponse.json({ error: "This team is not on the selected campaign." }, { status: 400 });
    }
    if (!team.givingLinkId) {
      return NextResponse.json({ error: "This team doesn't have a giving link set up yet." }, { status: 400 });
    }
    resolvedCampaignTeamId = team.id;
    resolvedFundraisingCampaignId = team.fundraisingCampaignId;
    resolvedGivingLinkId = team.givingLinkId;
  } else if (fundraisingCampaignId) {
    const campaign = await prisma.fundraisingCampaign.findFirst({ where: { id: fundraisingCampaignId, churchId: auth.churchId } });
    if (!campaign) return NextResponse.json({ error: "Fundraising campaign not found." }, { status: 404 });
    if (!campaign.givingLinkId) {
      return NextResponse.json({ error: "This campaign doesn't have a giving link set up yet." }, { status: 400 });
    }
    resolvedFundraisingCampaignId = campaign.id;
    resolvedGivingLinkId = campaign.givingLinkId;
  } else if (pledgeCampaignId) {
    const pledgeCampaign = await prisma.pledgeCampaign.findFirst({ where: { id: pledgeCampaignId, churchId: auth.churchId } });
    if (!pledgeCampaign) return NextResponse.json({ error: "Pledge campaign not found." }, { status: 404 });
    if (!pledgeCampaign.givingLinkId) {
      return NextResponse.json({ error: "This pledge campaign doesn't have a giving link set up yet." }, { status: 400 });
    }
    resolvedPledgeCampaignId = pledgeCampaign.id;
    resolvedGivingLinkId = pledgeCampaign.givingLinkId;
  }

  if (!resolvedGivingLinkId) {
    return NextResponse.json({ error: "A giving link, fundraising campaign, or pledge campaign is required." }, { status: 400 });
  }

  const link = await prisma.givingLink.findFirst({ where: { id: resolvedGivingLinkId, churchId: auth.churchId } });
  if (!link) {
    return NextResponse.json({ error: "Giving link not found." }, { status: 404 });
  }

  const donors =
    channel === "TEXT"
      ? await prisma.donor.findMany({
          where: { id: { in: donorIds }, churchId: auth.churchId, normalizedPhone: { not: null } },
          select: { id: true, name: true, normalizedPhone: true },
        })
      : await prisma.donor.findMany({
          where: { id: { in: donorIds }, churchId: auth.churchId, email: { not: null } },
          select: { id: true, name: true, email: true },
        });

  if (donors.length === 0) {
    return NextResponse.json(
      { error: channel === "TEXT" ? "None of the selected donors have a valid phone number on file." : "None of the selected donors have an email address on file." },
      { status: 400 }
    );
  }

  const campaign = await prisma.givingCampaign.create({
    data: {
      churchId: auth.churchId,
      givingLinkId: link.id,
      name,
      channel,
      emailSubject: channel === "EMAIL" ? emailSubject : null,
      emailBodyTemplate: channel === "EMAIL" ? emailBodyTemplate : null,
      textBodyTemplate: channel === "TEXT" ? textBodyTemplate : null,
      createdByUserId: auth.userId,
      fundraisingCampaignId: resolvedFundraisingCampaignId,
      campaignTeamId: resolvedCampaignTeamId,
      campaignFundraiserId: resolvedCampaignFundraiserId,
      pledgeCampaignId: resolvedPledgeCampaignId,
    },
  });

  await prisma.givingCampaignRecipient.createMany({
    data:
      channel === "TEXT"
        ? (donors as { id: string; name: string | null; normalizedPhone: string | null }[]).map((d) => ({
            campaignId: campaign.id,
            churchId: auth.churchId,
            donorId: d.id,
            trackingToken: generateCampaignTrackingToken(),
            recipientPhone: d.normalizedPhone,
            recipientName: d.name,
          }))
        : (donors as { id: string; name: string | null; email: string | null }[]).map((d) => ({
            campaignId: campaign.id,
            churchId: auth.churchId,
            donorId: d.id,
            trackingToken: generateCampaignTrackingToken(),
            recipientEmail: d.email,
            recipientName: d.name,
          })),
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "giving_campaign.created",
    entityType: "GivingCampaign",
    entityId: campaign.id,
    metadata: {
      name,
      givingLinkId: link.id,
      channel,
      requestedCount: donorIds.length,
      recipientCount: donors.length,
      fundraisingCampaignId: resolvedFundraisingCampaignId,
      campaignTeamId: resolvedCampaignTeamId,
      campaignFundraiserId: resolvedCampaignFundraiserId,
      pledgeCampaignId: resolvedPledgeCampaignId,
    },
    req,
  });

  return NextResponse.json({ campaign, recipientCount: donors.length, skippedCount: donorIds.length - donors.length }, { status: 201 });
}
