import { prisma } from "@/lib/prisma";
import { sendWgcEmail } from "@/lib/email";
import { DEFAULT_NOTIFICATION_PREFERENCE } from "@/lib/settings/notificationEvents";

/**
 * Sends a real event email only if the organization hasn't disabled it and
 * a real destination address exists. No-ops silently otherwise — this is a
 * best-effort notification, not a transactional flow, so it must never
 * throw and break the caller's main webhook/mutation path.
 */
export async function notifyEvent(params: {
  churchId: string;
  eventKey: string;
  subject: string;
  title: string;
  badgeText: string;
  badgeColor: string;
  bodyHtml: string;
}) {
  try {
    const [church, preference] = await Promise.all([
      prisma.church.findUnique({
        where: { id: params.churchId },
        select: { supportEmail: true, financeEmail: true, primaryContactEmail: true, name: true },
      }),
      prisma.notificationPreference.findUnique({
        where: { churchId_eventKey: { churchId: params.churchId, eventKey: params.eventKey } },
      }),
    ]);
    if (!church) return;

    const emailEnabled = preference ? preference.emailEnabled : DEFAULT_NOTIFICATION_PREFERENCE.emailEnabled;
    if (!emailEnabled) return;

    const to = church.supportEmail || church.financeEmail || church.primaryContactEmail;
    if (!to) return;

    await sendWgcEmail({
      to,
      subject: params.subject,
      title: params.title,
      badgeText: params.badgeText,
      badgeColor: params.badgeColor,
      bodyHtml: params.bodyHtml,
    });
  } catch (err) {
    console.error(`notifyEvent(${params.eventKey}) failed:`, err);
  }
}
