import { prisma } from "@/lib/prisma";
import { sendWgcEmail } from "@/lib/email";
import { formatCents } from "@/lib/format";
import { formatEventDate, formatEventTime } from "@/lib/eventRegistration/timezone";
import { publicEventUrl } from "@/lib/eventRegistration/eventConfig";
import {
  parseEmailTemplates,
  renderEventTemplate,
  bodyToHtml,
  escapeHtml,
  type EventEmailContext,
} from "@/lib/eventRegistration/emailTemplates";
import { loadEventAudience } from "@/lib/eventRegistration/audience";
import { ensureTicketTokens, ticketPageUrl, ticketQrImageUrl } from "@/lib/eventRegistration/tickets";

/**
 * Sending for the three automated event emails. Everything goes through the
 * existing sendWgcEmail (church-branded logo/sender, OrgEmailLog row per
 * send) — there is no event-specific mail transport.
 */

interface EmailEvent {
  id: string;
  churchId: string;
  slug: string;
  name: string;
  startsAt: Date;
  endsAt: Date | null;
  timezone: string;
  locationName: string | null;
  locationAddress: string | null;
  emailTemplatesJson: unknown;
}

function locationText(e: Pick<EmailEvent, "locationName" | "locationAddress">): string {
  return [e.locationName, e.locationAddress].filter(Boolean).join(", ");
}

export function buildEventEmailContext(
  event: EmailEvent,
  organizationName: string,
  who: {
    recipientFirstName: string | null;
    registrantFirstName: string;
    registrantLastName: string;
    groupName: string | null;
    attendeeCount: number;
    confirmationCode: string;
  }
): EventEmailContext {
  return {
    eventName: event.name,
    eventDate: formatEventDate(event.startsAt, event.timezone),
    eventTime: formatEventTime(event.startsAt, event.timezone),
    eventLocation: locationText(event) || "the event location",
    eventLink: publicEventUrl(event.slug),
    organizationName,
    registrantName: `${who.registrantFirstName} ${who.registrantLastName}`.trim(),
    registrantFirstName: who.registrantFirstName,
    recipientFirstName: who.recipientFirstName || who.registrantFirstName || "there",
    groupName: who.groupName ?? "",
    attendeeCount: String(who.attendeeCount),
    confirmationCode: who.confirmationCode,
  };
}

async function loadChurchBranding(churchId: string) {
  const church = await prisma.church.findUnique({
    where: { id: churchId },
    select: { name: true, logoUrl: true, primaryColor: true, statementSenderName: true },
  });
  const name = church?.name || "Your Organization";
  return {
    name,
    logoUrl: church?.logoUrl || undefined,
    primaryColor: church?.primaryColor || "#0B5DBC",
    senderName: church?.statementSenderName || name,
  };
}

/** The non-editable block appended to every confirmation: code, when/where, who, what they bought. */
function confirmationSummaryHtml(args: {
  ctx: EventEmailContext;
  attendees: { firstName: string; lastName: string }[];
  addOnLines: { nameSnapshot: string; quantity: number; lineTotalCents: number }[];
  totalCents: number;
  paid: boolean;
}): string {
  const { ctx, attendees, addOnLines, totalCents, paid } = args;
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 12px 6px 0;color:#64748b;font-size:14px;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td><td style="padding:6px 0;color:#0B1320;font-size:14px;font-weight:600;">${value}</td></tr>`;
  const rows = [
    row("Confirmation code", escapeHtml(ctx.confirmationCode)),
    row("Event", escapeHtml(ctx.eventName)),
    row("When", `${escapeHtml(ctx.eventDate)} at ${escapeHtml(ctx.eventTime)}`),
    row("Where", escapeHtml(ctx.eventLocation)),
    ...(ctx.groupName ? [row("Group", escapeHtml(ctx.groupName))] : []),
    row("Attendees", attendees.map((a) => escapeHtml(`${a.firstName} ${a.lastName}`.trim())).join("<br/>")),
    ...(addOnLines.length > 0
      ? [row("Add-ons", addOnLines.map((l) => escapeHtml(`${l.nameSnapshot}${l.quantity > 1 ? ` × ${l.quantity}` : ""}`)).join("<br/>"))]
      : []),
    ...(totalCents > 0 ? [row(paid ? "Total paid" : "Total", escapeHtml(formatCents(totalCents)))] : []),
  ].join("");
  return `<table style="margin-top:24px;border-top:1px solid #e2e8f0;padding-top:12px;width:100%;" cellpadding="0" cellspacing="0"><tbody>${rows}</tbody></table>`;
}

/** One QR ticket per attendee — the thing they hold up at the door. The image is a hosted PNG because mail clients block inline data: images. */
function ticketsHtml(attendees: { firstName: string; lastName: string; ticketToken: string | null }[]): string {
  const cards = attendees
    .filter((a): a is typeof a & { ticketToken: string } => Boolean(a.ticketToken))
    .map((a) => {
      const name = escapeHtml(`${a.firstName} ${a.lastName}`.trim());
      return `<div style="display:inline-block;vertical-align:top;margin:8px 8px 0 0;padding:14px;border:1px solid #e2e8f0;border-radius:12px;text-align:center;width:200px;">
<p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#0B1320;">${name}</p>
<a href="${escapeHtml(ticketPageUrl(a.ticketToken))}"><img src="${escapeHtml(ticketQrImageUrl(a.ticketToken))}" alt="Ticket QR code for ${name}" width="172" height="172" style="display:block;margin:0 auto;border:0;" /></a>
<p style="margin:8px 0 0;font-size:12px;"><a href="${escapeHtml(ticketPageUrl(a.ticketToken))}" style="color:#0B5DBC;">Open ticket</a></p>
</div>`;
    })
    .join("");
  if (!cards) return "";
  return `<div style="margin-top:24px;border-top:1px solid #e2e8f0;padding-top:12px;"><p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#0B1320;">Your ticket${attendees.length > 1 ? "s" : ""}</p><p style="margin:0;font-size:13px;color:#64748b;">Show ${attendees.length > 1 ? "each QR code" : "this QR code"} at the entrance to check in.</p>${cards}</div>`;
}

/** Sends the confirmation to the registrant. Idempotent: a registration is only ever emailed once unless `force`. */
export async function sendRegistrationConfirmationEmail(
  registrationId: string,
  opts: { force?: boolean; resendByUserId?: string } = {}
): Promise<boolean> {
  const registration = await prisma.eventRegistration.findUnique({ where: { id: registrationId } });
  if (!registration || registration.status !== "CONFIRMED") return false;
  if (registration.confirmationEmailSentAt && !opts.force) return false;

  const event = await prisma.event.findFirst({ where: { id: registration.eventId, churchId: registration.churchId } });
  if (!event) return false;

  const [attendees, addOnLines, branding] = await Promise.all([
    // Also backfills a ticket token for any attendee that predates tickets.
    ensureTicketTokens(registrationId, registration.churchId),
    prisma.eventRegistrationAddOn.findMany({ where: { registrationId, churchId: registration.churchId } }),
    loadChurchBranding(registration.churchId),
  ]);

  const templates = parseEmailTemplates(event.emailTemplatesJson);
  const ctx = buildEventEmailContext(event, branding.name, {
    recipientFirstName: registration.registrantFirstName,
    registrantFirstName: registration.registrantFirstName,
    registrantLastName: registration.registrantLastName,
    groupName: registration.groupName,
    attendeeCount: registration.attendeeCount,
    confirmationCode: registration.confirmationCode,
  });

  const subject = renderEventTemplate(templates.confirmation.subject, ctx, { html: false });
  const bodyHtml =
    bodyToHtml(templates.confirmation.body, ctx) +
    confirmationSummaryHtml({
      ctx,
      attendees,
      addOnLines,
      totalCents: registration.totalCents,
      paid: Boolean(registration.paymentId) || registration.paymentMethod === "CASH" || registration.paymentMethod === "CHECK",
    }) +
    ticketsHtml(attendees);

  const result = await sendWgcEmail({
    to: registration.registrantEmail,
    subject,
    title: subject,
    badgeText: "Registration confirmed",
    badgeColor: branding.primaryColor,
    bodyHtml,
    logoUrl: branding.logoUrl,
    logoAlt: branding.name,
    senderName: branding.senderName,
    log: {
      churchId: registration.churchId,
      donorId: registration.donorId,
      recipientName: `${registration.registrantFirstName} ${registration.registrantLastName}`.trim(),
      category: "EVENT_CONFIRMATION",
      relatedEntityType: "EventRegistration",
      relatedEntityId: registration.id,
      ...(opts.resendByUserId ? { createdByUserId: opts.resendByUserId, isResend: true } : {}),
    },
  });

  if (result.success && !opts.resendByUserId) {
    await prisma.eventRegistration.update({ where: { id: registrationId }, data: { confirmationEmailSentAt: new Date() } });
  }
  return Boolean(result.success);
}

/**
 * Re-sends one logged reminder / thank-you to the SAME address it first went
 * to (from the Email Logs "Resend" button). Scoped to `churchId`; never
 * touches the event's sent-markers, so it can't interfere with the cron.
 * A merchant's own "send me a test" (logged against the Event, not a
 * registration) has no recipient context and is refused.
 */
export async function resendEventNotice(params: {
  churchId: string;
  kind: BroadcastKind;
  registrationId: string;
  to: string;
  recipientName: string | null;
  userId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { churchId } = params;
  const registration = await prisma.eventRegistration.findFirst({ where: { id: params.registrationId, churchId } });
  if (!registration) return { ok: false, error: "Registration not found." };
  const event = await prisma.event.findFirst({ where: { id: registration.eventId, churchId } });
  if (!event) return { ok: false, error: "Event not found." };

  const branding = await loadChurchBranding(churchId);
  const templates = parseEmailTemplates(event.emailTemplatesJson);
  const template = params.kind === "reminder" ? templates.reminder : templates.thankYou;
  const ctx = buildEventEmailContext(event, branding.name, {
    recipientFirstName: params.recipientName?.split(" ")[0] || null,
    registrantFirstName: registration.registrantFirstName,
    registrantLastName: registration.registrantLastName,
    groupName: registration.groupName,
    attendeeCount: registration.attendeeCount,
    confirmationCode: registration.confirmationCode,
  });
  const subject = renderEventTemplate(template.subject, ctx, { html: false });
  const result = await sendWgcEmail({
    to: params.to,
    subject,
    title: subject,
    badgeText: params.kind === "reminder" ? "Event reminder" : "Thank you",
    badgeColor: branding.primaryColor,
    bodyHtml: bodyToHtml(template.body, ctx),
    logoUrl: branding.logoUrl,
    logoAlt: branding.name,
    senderName: branding.senderName,
    log: {
      churchId,
      donorId: registration.donorId,
      recipientName: params.recipientName,
      category: params.kind === "reminder" ? "EVENT_REMINDER" : "EVENT_THANK_YOU",
      relatedEntityType: "EventRegistration",
      relatedEntityId: registration.id,
      createdByUserId: params.userId,
      isResend: true,
    },
  });
  return result.success ? { ok: true } : { ok: false, error: "Failed to resend the email." };
}

export type BroadcastKind = "reminder" | "thankYou";

export interface BroadcastResult {
  recipients: number;
  sent: number;
  failed: number;
}

/**
 * Sends the reminder or thank-you to everyone attached to a confirmed
 * registration (attendees + registrants, de-duplicated by email). `testTo`
 * sends exactly one preview to that address instead, rendered with sample
 * names, and touches no markers.
 */
export async function sendEventBroadcast(
  churchId: string,
  eventId: string,
  kind: BroadcastKind,
  opts: { testTo?: string; scope?: "EVERYONE" } = {}
): Promise<BroadcastResult> {
  const event = await prisma.event.findFirst({ where: { id: eventId, churchId } });
  if (!event) return { recipients: 0, sent: 0, failed: 0 };

  const branding = await loadChurchBranding(churchId);
  const templates = parseEmailTemplates(event.emailTemplatesJson);
  const template = kind === "reminder" ? templates.reminder : templates.thankYou;
  const logCategory = kind === "reminder" ? "EVENT_REMINDER" : "EVENT_THANK_YOU";
  const badgeText = kind === "reminder" ? "Event reminder" : "Thank you";

  const sendOne = async (to: string, ctx: EventEmailContext, recipientName: string | null, donorId: string | null, registrationId: string | null) => {
    const subject = renderEventTemplate(template.subject, ctx, { html: false });
    const result = await sendWgcEmail({
      to,
      subject,
      title: subject,
      badgeText,
      badgeColor: branding.primaryColor,
      bodyHtml: bodyToHtml(template.body, ctx),
      logoUrl: branding.logoUrl,
      logoAlt: branding.name,
      senderName: branding.senderName,
      log: {
        churchId,
        donorId,
        recipientName,
        category: logCategory,
        relatedEntityType: registrationId ? "EventRegistration" : "Event",
        relatedEntityId: registrationId ?? event.id,
      },
    });
    return Boolean(result.success);
  };

  if (opts.testTo) {
    const ctx = buildEventEmailContext(event, branding.name, {
      recipientFirstName: "Alex",
      registrantFirstName: "Alex",
      registrantLastName: "Sample",
      groupName: "Sample Team",
      attendeeCount: 2,
      confirmationCode: "SAMPLE12",
    });
    const ok = await sendOne(opts.testTo, ctx, "Alex Sample", null, null);
    return { recipients: 1, sent: ok ? 1 : 0, failed: ok ? 0 : 1 };
  }

  const audience = await loadEventAudience(churchId, eventId, "EVERYONE");
  if (audience.length === 0) return { recipients: 0, sent: 0, failed: 0 };

  const registrations = await prisma.eventRegistration.findMany({
    where: { churchId, eventId, id: { in: [...new Set(audience.map((a) => a.registrationId))] } },
    select: { id: true, registrantFirstName: true, registrantLastName: true, groupName: true, attendeeCount: true, confirmationCode: true },
  });
  const regById = new Map(registrations.map((r) => [r.id, r]));

  let sent = 0;
  let failed = 0;
  for (const person of audience) {
    const reg = regById.get(person.registrationId);
    if (!reg) continue;
    const ctx = buildEventEmailContext(event, branding.name, {
      recipientFirstName: person.firstName,
      registrantFirstName: reg.registrantFirstName,
      registrantLastName: reg.registrantLastName,
      groupName: reg.groupName,
      attendeeCount: reg.attendeeCount,
      confirmationCode: reg.confirmationCode,
    });
    const ok = await sendOne(person.email, ctx, person.name, person.donorId, reg.id);
    if (ok) sent++;
    else failed++;
  }
  return { recipients: audience.length, sent, failed };
}
