import { prisma } from "@/lib/prisma";
import { sendEventBroadcast, type BroadcastKind, type BroadcastResult } from "@/lib/eventRegistration/eventEmails";
import { parseEmailTemplates } from "@/lib/eventRegistration/emailTemplates";

/**
 * Claim-before-send for the reminder and thank-you emails. The marker
 * column (reminderSentAt / thankYouSentAt) is set atomically BEFORE any
 * email goes out, so two overlapping cron runs — or a cron run racing a
 * merchant's manual "Send now" — can never both send. If nothing at all
 * was delivered the claim is released so the next run retries; a partial
 * delivery keeps the claim (re-sending would double-email the people who
 * already got it).
 */

const MARKER = { reminder: "reminderSentAt", thankYou: "thankYouSentAt" } as const;

export type ClaimedBroadcastResult = { claimed: false } | ({ claimed: true } & BroadcastResult);

export async function claimAndSendBroadcast(churchId: string, eventId: string, kind: BroadcastKind, opts: { force?: boolean } = {}): Promise<ClaimedBroadcastResult> {
  const marker = MARKER[kind];
  const now = new Date();
  const claim = await prisma.event.updateMany({
    where: { id: eventId, churchId, ...(opts.force ? {} : { [marker]: null }) },
    data: { [marker]: now },
  });
  if (claim.count === 0) return { claimed: false };

  try {
    const result = await sendEventBroadcast(churchId, eventId, kind);
    if (result.recipients > 0 && result.sent === 0) {
      await prisma.event.updateMany({ where: { id: eventId, churchId }, data: { [marker]: null } });
    }
    return { claimed: true, ...result };
  } catch (err) {
    await prisma.event.updateMany({ where: { id: eventId, churchId }, data: { [marker]: null } });
    throw err;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** A thank-you more than this long after the event is stale — better skipped than sent a season late. */
const THANK_YOU_MAX_AGE_DAYS = 30;

export interface DueEvent {
  id: string;
  churchId: string;
  kind: BroadcastKind;
}

/** Which ACTIVE events owe a reminder or thank-you right now. Pure over the rows it is given. */
export function findDueBroadcasts(
  events: {
    id: string;
    churchId: string;
    startsAt: Date;
    endsAt: Date | null;
    emailTemplatesJson: unknown;
    reminderSentAt: Date | null;
    thankYouSentAt: Date | null;
  }[],
  now: Date
): DueEvent[] {
  const due: DueEvent[] = [];
  for (const e of events) {
    const templates = parseEmailTemplates(e.emailTemplatesJson);
    if (templates.reminder.enabled && !e.reminderSentAt) {
      const sendFrom = e.startsAt.getTime() - templates.reminder.daysBefore * DAY_MS;
      if (now.getTime() >= sendFrom && now < e.startsAt) due.push({ id: e.id, churchId: e.churchId, kind: "reminder" });
    }
    if (templates.thankYou.enabled && !e.thankYouSentAt) {
      const end = (e.endsAt ?? e.startsAt).getTime();
      const sendFrom = end + templates.thankYou.daysAfter * DAY_MS;
      if (now.getTime() >= sendFrom && now.getTime() <= end + (templates.thankYou.daysAfter + THANK_YOU_MAX_AGE_DAYS) * DAY_MS) {
        due.push({ id: e.id, churchId: e.churchId, kind: "thankYou" });
      }
    }
  }
  return due;
}
