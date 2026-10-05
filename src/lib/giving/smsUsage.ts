import { prisma } from "@/lib/prisma";

/** [inclusive start, exclusive end) UTC boundaries of the calendar month
 * containing `now` — "this month's usage," what the merchant-facing status
 * shows and what the plan's included-texts allowance is measured against. */
export function resolveCurrentMonthRange(now: Date = new Date()): { start: Date; end: Date; billingPeriod: string } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const billingPeriod = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
  return { start, end, billingPeriod };
}

/** [inclusive start, exclusive end) UTC boundaries of the calendar month
 * immediately before `now` — what the monthly overage-detection cron
 * checks (the month that just fully completed). */
export function resolvePriorMonthRange(now: Date = new Date()): { start: Date; end: Date; billingPeriod: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1));
  const billingPeriod = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
  return { start, end, billingPeriod };
}

/**
 * Counts successfully-sent text messages for a church within [start, end) —
 * the two places text sending actually happens: bulk Giving Campaigns
 * (channel TEXT) and the giving-link Share modal's individual Send Text
 * tab. Both count toward the same plan allowance since both hit the same
 * Twilio number and cost; a church can't dodge the cap by using one
 * feature instead of the other.
 */
export async function getSmsUsageForPeriod(churchId: string, start: Date, end: Date): Promise<number> {
  // GivingCampaignRecipient has no Prisma relation to GivingCampaign (this
  // schema's plain-string-FK convention) and doesn't store its own
  // channel, so a TEXT campaign's recipients are counted in two steps:
  // find this church's TEXT campaign ids, then count SENT recipients on
  // those specific campaigns.
  const textCampaigns = await prisma.givingCampaign.findMany({
    where: { churchId, channel: "TEXT" },
    select: { id: true },
  });

  const [campaignTexts, shareTexts] = await Promise.all([
    textCampaigns.length === 0
      ? Promise.resolve(0)
      : prisma.givingCampaignRecipient.count({
          where: {
            churchId,
            campaignId: { in: textCampaigns.map((c) => c.id) },
            sendStatus: "SENT",
            sentAt: { gte: start, lt: end },
          },
        }),
    prisma.givingLinkShare.count({
      where: { churchId, channel: "TEXT", state: "SENT", createdAt: { gte: start, lt: end } },
    }),
  ]);

  return campaignTexts + shareTexts;
}
