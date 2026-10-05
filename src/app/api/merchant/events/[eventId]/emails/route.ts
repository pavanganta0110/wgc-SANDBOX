import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { validationError } from "@/lib/utils/validationError";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { guardEventsRoute, loadOwnedEvent, notFoundResponse } from "@/lib/eventRegistration/merchantGuard";
import { validateEmailTemplates } from "@/lib/eventRegistration/emailTemplates";
import { sendEventBroadcast } from "@/lib/eventRegistration/eventEmails";
import { claimAndSendBroadcast } from "@/lib/eventRegistration/eventBroadcast";

type Ctx = { params: Promise<{ eventId: string }> };

/** Saves the three email templates. Body: the EventEmailTemplates object. */
export async function PUT(req: Request, { params }: Ctx) {
  const guard = await guardEventsRoute("canManageEvents");
  if ("response" in guard) return guard.response;
  const { auth } = guard;
  const { eventId } = await params;

  const event = await loadOwnedEvent(auth.churchId, eventId);
  if (!event || event.archivedAt) return notFoundResponse();

  const body = await req.json().catch(() => null);
  const validation = validateEmailTemplates(body);
  if (!validation.ok) return validationError(validation.error);

  await prisma.event.update({ where: { id: event.id }, data: { emailTemplatesJson: validation.templates as unknown as Prisma.InputJsonValue } });
  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "event.emails_updated",
    entityType: "event",
    entityId: event.id,
    req,
  });
  return NextResponse.json({ success: true, templates: validation.templates });
}

/**
 * Body: { action: "test", kind: "reminder"|"thankYou" } sends one preview to
 * the signed-in user's own address (never an arbitrary one — this endpoint
 * must not be usable as a mail relay), or
 * { action: "send", kind, force? } sends to the whole event now.
 */
export async function POST(req: Request, { params }: Ctx) {
  const guard = await guardEventsRoute("canManageEvents");
  if ("response" in guard) return guard.response;
  const { auth } = guard;
  const { eventId } = await params;

  const event = await loadOwnedEvent(auth.churchId, eventId);
  if (!event || event.archivedAt) return notFoundResponse();

  const body = await req.json().catch(() => null);
  const kind = body?.kind;
  if (kind !== "reminder" && kind !== "thankYou") return validationError("Choose reminder or thank-you.");

  if (body.action === "test") {
    const result = await sendEventBroadcast(auth.churchId, event.id, kind, { testTo: auth.email });
    if (result.sent === 0) return validationError("The test email could not be sent. Please try again.", 502);
    return NextResponse.json({ success: true, sentTo: auth.email });
  }

  if (body.action === "send") {
    const result = await claimAndSendBroadcast(auth.churchId, event.id, kind, { force: body.force === true });
    if (!result.claimed) {
      return validationError("This email has already been sent for this event. Choose “Send again” to resend it.", 409);
    }
    await logDashboardAction({
      churchId: auth.churchId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.rawRole,
      action: "event.email_sent",
      entityType: "event",
      entityId: event.id,
      metadata: { kind, recipients: result.recipients, sent: result.sent, failed: result.failed },
      req,
    });
    return NextResponse.json({ success: true, recipients: result.recipients, sent: result.sent, failed: result.failed });
  }

  return validationError("Unknown action.");
}
