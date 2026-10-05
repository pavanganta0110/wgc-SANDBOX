import { prisma } from "@/lib/prisma";
import { sendWgcEmail } from "@/lib/email";
import { NOTIFICATION_EVENTS, resolveNotificationDefault } from "@/lib/settings/notificationEvents";

/**
 * Sends a real event email only if the organization hasn't disabled it and
 * a real destination address exists. No-ops silently otherwise — this is a
 * best-effort notification, not a transactional flow, so it must never
 * throw and break the caller's main webhook/mutation path.
 *
 * Recipient, in priority order:
 *   1. params.recipientUserId, when given — the specific staff account that
 *      actually caused this event (e.g. whoever was logged in and used
 *      Take Payment to enter a donation themselves). That person already
 *      knows something happened; this is their own confirmation, not a
 *      general org broadcast, so it goes to them alone, not the owner or
 *      the rest of the team.
 *   2. Otherwise, the church's own "owner" User account
 *      (Church.primaryOwnerUserId -> User.email) — the real login the org
 *      actually checks, rather than a separate supportEmail/financeEmail/
 *      primaryContactEmail field that can be unset or stale. This is the
 *      right default for events with no specific actor (a donor's own
 *      self-service gift, a dispute Finix opened, a settlement funding).
 *   3. That old contact-email chain, only for churches not yet backfilled
 *      with a primaryOwnerUserId (nullable during migration — see Church's
 *      own field comment) or whose owner/recipientUserId account is
 *      disabled.
 */
export async function notifyEvent(params: {
  churchId: string;
  eventKey: string;
  subject: string;
  title: string;
  badgeText: string;
  badgeColor: string;
  bodyHtml: string;
  /** The specific user who caused this event, if any — see recipient
   * priority above. Omit for events with no single responsible actor. */
  recipientUserId?: string | null;
  /** Threaded straight through to sendWgcEmail's own `log` — see that
   * option's comment on WgcEmailOptions for why this is required for the
   * email to appear in the org's Email Logs page at all (previously
   * omitted here entirely, so every notifyEvent email — disputes,
   * settlements, merchandise orders, donations — sent successfully but
   * never showed up in Email Logs). */
  relatedEntityType?: string;
  relatedEntityId?: string;
}) {
  try {
    const [church, preference, recipientUser] = await Promise.all([
      prisma.church.findUnique({
        where: { id: params.churchId },
        select: { primaryOwnerUserId: true, supportEmail: true, financeEmail: true, primaryContactEmail: true, name: true },
      }),
      prisma.notificationPreference.findUnique({
        where: { churchId_eventKey: { churchId: params.churchId, eventKey: params.eventKey } },
      }),
      params.recipientUserId
        ? prisma.user.findUnique({ where: { id: params.recipientUserId }, select: { email: true, disabledAt: true } })
        : Promise.resolve(null),
    ]);
    if (!church) return;

    const eventDef = NOTIFICATION_EVENTS.find((e) => e.key === params.eventKey);
    const emailEnabled = preference ? preference.emailEnabled : resolveNotificationDefault(eventDef ?? {}).emailEnabled;
    if (!emailEnabled) return;

    const owner = !params.recipientUserId && church.primaryOwnerUserId
      ? await prisma.user.findUnique({ where: { id: church.primaryOwnerUserId }, select: { email: true, disabledAt: true } })
      : null;
    const to =
      (recipientUser && !recipientUser.disabledAt ? recipientUser.email : null) ||
      (owner && !owner.disabledAt ? owner.email : null) ||
      church.supportEmail ||
      church.financeEmail ||
      church.primaryContactEmail;
    if (!to) return;

    await sendWgcEmail({
      to,
      subject: params.subject,
      title: params.title,
      badgeText: params.badgeText,
      badgeColor: params.badgeColor,
      bodyHtml: params.bodyHtml,
      log: {
        churchId: params.churchId,
        category: "MERCHANT_NOTIFICATION",
        relatedEntityType: params.relatedEntityType ?? params.eventKey,
        relatedEntityId: params.relatedEntityId ?? null,
      },
    });
  } catch (err) {
    console.error(`notifyEvent(${params.eventKey}) failed:`, err);
  }
}
