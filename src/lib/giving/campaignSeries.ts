import { prisma } from "@/lib/prisma";
import { resolveCampaignAudience, isAudienceSource, type AudienceRequest } from "@/lib/giving/campaignAudience";
import { generateCampaignTrackingToken } from "@/lib/giving/campaignTemplate";
import { sendCampaignChunk } from "@/lib/giving/campaignSender";

/**
 * Repeating ("every month") Giving Campaigns.
 *
 * A series is one GivingCampaign row in status SCHEDULED that stores the
 * message plus an audience RULE (e.g. "all donors"). Each month the cron
 * creates an ordinary child campaign for whoever matches that rule at that
 * moment — new donors join automatically, unsubscribed addresses and people
 * without an email are left out — and sends it. Runs are claimed in the
 * database before any email goes out, so overlapping cron runs can never
 * send the same month twice, and a send that doesn't finish inside one cron
 * invocation simply continues on the next one.
 */

const RUN_HOUR_UTC = 12;
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** First run: the chosen calendar date (YYYY-MM-DD). Null if it isn't a real date. */
export function firstRunAt(startsOn: string): { runAt: Date; dayOfMonth: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startsOn);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const runAt = new Date(Date.UTC(y, mo - 1, d, RUN_HOUR_UTC));
  if (runAt.getUTCFullYear() !== y || runAt.getUTCMonth() !== mo - 1 || runAt.getUTCDate() !== d) return null;
  // Days 29-31 don't exist in every month, so later months use the 28th at most.
  return { runAt, dayOfMonth: Math.min(d, 28) };
}

export function nextRunAfter(prev: Date, dayOfMonth: number): Date {
  return new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() + 1, Math.min(dayOfMonth, 28), RUN_HOUR_UTC));
}

export function monthLabel(date: Date): string {
  return `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** The stored audience rule, or null if it isn't a valid dynamic rule (a hand-picked list can't repeat). */
export function parseAudienceRule(json: unknown): AudienceRequest | null {
  if (!json || typeof json !== "object") return null;
  const j = json as Record<string, unknown>;
  if (!isAudienceSource(j.source) || j.source === "SELECTED") return null;
  return {
    source: j.source,
    givingLinkId: typeof j.givingLinkId === "string" ? j.givingLinkId : undefined,
    eventId: typeof j.eventId === "string" ? j.eventId : undefined,
    eventScope: typeof j.eventScope === "string" ? j.eventScope : undefined,
  };
}

export interface SeriesRunSummary {
  seriesDue: number;
  campaignsCreated: number;
  emailsSent: number;
  emailsFailed: number;
  skippedEmptyAudience: number;
  resumed: number;
}

async function sendUntilDone(campaignId: string, churchId: string, deadline: number, summary: SeriesRunSummary): Promise<void> {
  while (Date.now() < deadline) {
    const r = await sendCampaignChunk({ campaignId, churchId, actorUserId: null });
    if (!r) return;
    summary.emailsSent += r.sent;
    summary.emailsFailed += r.failed;
    if (r.done || r.processed === 0) return;
  }
}

export async function runDueSeries(now: Date = new Date(), budgetMs = 45_000): Promise<SeriesRunSummary> {
  const deadline = Date.now() + budgetMs;
  const summary: SeriesRunSummary = { seriesDue: 0, campaignsCreated: 0, emailsSent: 0, emailsFailed: 0, skippedEmptyAudience: 0, resumed: 0 };

  // 1. Finish any monthly send that ran out of time on a previous invocation.
  const inFlight = await prisma.givingCampaign.findMany({
    where: { parentCampaignId: { not: null }, status: { in: ["DRAFT", "SENDING"] }, channel: "EMAIL" },
    select: { id: true, churchId: true },
    take: 20,
  });
  for (const c of inFlight) {
    summary.resumed += 1;
    await sendUntilDone(c.id, c.churchId, deadline, summary);
  }

  // 2. Start this month's send for every series that is due.
  const due = await prisma.givingCampaign.findMany({
    where: { status: "SCHEDULED", repeatInterval: "MONTHLY", repeatPausedAt: null, nextRunAt: { lte: now } },
    orderBy: { nextRunAt: "asc" },
    take: 50,
  });
  summary.seriesDue = due.length;

  for (const series of due) {
    if (Date.now() >= deadline) break;
    if (!series.nextRunAt) continue;

    if (series.repeatEndsAt && series.nextRunAt > series.repeatEndsAt) {
      await prisma.givingCampaign.updateMany({ where: { id: series.id, churchId: series.churchId }, data: { status: "ENDED", nextRunAt: null } });
      continue;
    }

    // Claim this run before doing anything: a concurrent invocation that
    // read the same nextRunAt finds count 0 and stops.
    const claim = await prisma.givingCampaign.updateMany({
      where: { id: series.id, churchId: series.churchId, nextRunAt: series.nextRunAt, repeatPausedAt: null, status: "SCHEDULED" },
      data: { nextRunAt: nextRunAfter(series.nextRunAt, series.repeatDayOfMonth ?? series.nextRunAt.getUTCDate()), lastRunAt: now },
    });
    if (claim.count === 0) continue;

    const rule = parseAudienceRule(series.audienceJson);
    const audience = rule ? await resolveCampaignAudience(series.churchId, rule, "EMAIL") : null;
    if (!audience || !audience.ok || audience.recipients.length === 0) {
      summary.skippedEmptyAudience += 1;
      continue;
    }

    const child = await prisma.givingCampaign.create({
      data: {
        churchId: series.churchId,
        givingLinkId: series.givingLinkId,
        name: `${series.name} — ${monthLabel(series.nextRunAt)}`,
        channel: "EMAIL",
        emailSubject: series.emailSubject,
        emailBodyTemplate: series.emailBodyTemplate,
        createdByUserId: series.createdByUserId,
        fundraisingCampaignId: series.fundraisingCampaignId,
        campaignTeamId: series.campaignTeamId,
        campaignFundraiserId: series.campaignFundraiserId,
        pledgeCampaignId: series.pledgeCampaignId,
        parentCampaignId: series.id,
      },
    });
    await prisma.givingCampaignRecipient.createMany({
      data: audience.recipients.map((r) => ({
        campaignId: child.id,
        churchId: series.churchId,
        donorId: r.donorId,
        trackingToken: generateCampaignTrackingToken(),
        recipientEmail: r.email,
        recipientName: r.name,
      })),
    });
    summary.campaignsCreated += 1;
    await sendUntilDone(child.id, series.churchId, deadline, summary);
  }

  return summary;
}
