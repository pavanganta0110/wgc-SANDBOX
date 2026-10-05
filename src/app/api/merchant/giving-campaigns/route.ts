import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { hasPermission } from "@/lib/auth/permissions";
import { isAudienceSource, resolveCampaignAudience } from "@/lib/giving/campaignAudience";
import { firstRunAt } from "@/lib/giving/campaignSeries";
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
  // Who receives it. Omitted = the original hand-picked donorIds flow; every
  // other source is resolved server-side from this church's own data.
  const audienceBody = body.audience && typeof body.audience === "object" ? body.audience : {};
  const audienceSource = isAudienceSource(audienceBody.source) ? audienceBody.source : "SELECTED";
  // Optional "send automatically every month" — email only, and only for an
  // audience RULE (all donors, a giving page, an event…), never a hand-picked
  // list, so each month reaches whoever matches that month.
  const scheduleBody = body.schedule && typeof body.schedule === "object" ? body.schedule : null;
  let schedule: { runAt: Date; dayOfMonth: number; endsAt: Date | null } | null = null;
  if (scheduleBody) {
    if (scheduleBody.repeat !== "MONTHLY") return NextResponse.json({ error: "Only monthly repeats are supported." }, { status: 400 });
    if (channel !== "EMAIL") return NextResponse.json({ error: "Repeating campaigns can only be sent by email." }, { status: 400 });
    if (audienceSource === "SELECTED") return NextResponse.json({ error: "Choose an audience such as All donors for a repeating campaign — a hand-picked list can't repeat." }, { status: 400 });
    const first = typeof scheduleBody.startsOn === "string" ? firstRunAt(scheduleBody.startsOn) : null;
    if (!first) return NextResponse.json({ error: "Choose the date of the first send." }, { status: 400 });
    if (first.runAt.getTime() < Date.now() - 24 * 60 * 60 * 1000) return NextResponse.json({ error: "The first send can't be in the past." }, { status: 400 });
    let endsAt: Date | null = null;
    if (typeof scheduleBody.endsOn === "string" && scheduleBody.endsOn) {
      const end = firstRunAt(scheduleBody.endsOn);
      if (!end || end.runAt < first.runAt) return NextResponse.json({ error: "The end date must be after the first send." }, { status: 400 });
      endsAt = end.runAt;
    }
    schedule = { runAt: first.runAt, dayOfMonth: first.dayOfMonth, endsAt };
  }

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
  if (audienceSource === "SELECTED" && donorIds.length === 0) {
    return NextResponse.json({ error: "Select at least one donor." }, { status: 400 });
  }
  if (audienceSource === "EVENT" && !hasPermission(auth, "canViewEvents")) {
    return NextResponse.json({ error: "You don't have permission to message event attendees." }, { status: 403 });
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

  const audience = await resolveCampaignAudience(
    auth.churchId,
    {
      source: audienceSource,
      donorIds,
      givingLinkId: typeof audienceBody.givingLinkId === "string" ? audienceBody.givingLinkId : undefined,
      eventId: typeof audienceBody.eventId === "string" ? audienceBody.eventId : undefined,
      eventScope: typeof audienceBody.eventScope === "string" ? audienceBody.eventScope : undefined,
    },
    channel === "TEXT" ? "TEXT" : "EMAIL"
  );
  if (!audience.ok) {
    return NextResponse.json({ error: audience.error }, { status: audience.status });
  }
  const donors = audience.recipients;

  if (donors.length === 0 && !schedule) {
    return NextResponse.json(
      {
        error:
          audienceSource === "SELECTED"
            ? channel === "TEXT"
              ? "None of the selected donors have a valid phone number on file."
              : "None of the selected donors have an email address on file."
            : "No one in this audience can be reached on this channel.",
      },
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
      ...(schedule
        ? {
            status: "SCHEDULED",
            repeatInterval: "MONTHLY",
            repeatDayOfMonth: schedule.dayOfMonth,
            nextRunAt: schedule.runAt,
            repeatEndsAt: schedule.endsAt,
            audienceJson: {
              source: audienceSource,
              givingLinkId: typeof audienceBody.givingLinkId === "string" ? audienceBody.givingLinkId : undefined,
              eventId: typeof audienceBody.eventId === "string" ? audienceBody.eventId : undefined,
              eventScope: typeof audienceBody.eventScope === "string" ? audienceBody.eventScope : undefined,
            },
          }
        : {}),
    },
  });

  if (schedule) {
    await logDashboardAction({
      churchId: auth.churchId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.rawRole,
      action: "giving_campaign.scheduled",
      entityType: "GivingCampaign",
      entityId: campaign.id,
      metadata: { name, audienceSource, firstRun: schedule.runAt.toISOString(), endsAt: schedule.endsAt?.toISOString() ?? null },
      req,
    });
    return NextResponse.json({ campaign, scheduled: true, nextRunAt: schedule.runAt.toISOString(), currentAudienceCount: donors.length }, { status: 201 });
  }

  await prisma.givingCampaignRecipient.createMany({
    data: donors.map((d) => ({
      campaignId: campaign.id,
      churchId: auth.churchId,
      donorId: d.donorId,
      trackingToken: generateCampaignTrackingToken(),
      recipientEmail: channel === "TEXT" ? null : d.email,
      recipientPhone: channel === "TEXT" ? d.phone : null,
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
      audienceSource,
      requestedCount: audienceSource === "SELECTED" ? donorIds.length : donors.length,
      recipientCount: donors.length,
      fundraisingCampaignId: resolvedFundraisingCampaignId,
      campaignTeamId: resolvedCampaignTeamId,
      campaignFundraiserId: resolvedCampaignFundraiserId,
      pledgeCampaignId: resolvedPledgeCampaignId,
    },
    req,
  });

  return NextResponse.json({ campaign, recipientCount: donors.length, skippedCount: audienceSource === "SELECTED" ? donorIds.length - donors.length : 0 }, { status: 201 });
}
