import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { validationError } from "@/lib/utils/validationError";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { guardEventsRoute, loadOwnedEvent, notFoundResponse } from "@/lib/eventRegistration/merchantGuard";
import { loadEventStats } from "@/lib/eventRegistration/eventStats";
import { validateEventSettings, validateAddOns, publicEventUrl, appOrigin } from "@/lib/eventRegistration/eventConfig";
import { provisionEventGivingLink, syncEventGivingLink } from "@/lib/eventRegistration/eventGivingLink";
import { parseCustomFields } from "@/lib/eventRegistration/customFields";
import { parseEmailTemplates } from "@/lib/eventRegistration/emailTemplates";
import { utcToZonedLocal } from "@/lib/eventRegistration/timezone";

type Ctx = { params: Promise<{ eventId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const guard = await guardEventsRoute("canViewEvents");
  if ("response" in guard) return guard.response;
  const { auth } = guard;
  const { eventId } = await params;

  const event = await loadOwnedEvent(auth.churchId, eventId);
  if (!event || event.archivedAt) return notFoundResponse();

  const [addOns, stats] = await Promise.all([
    prisma.eventAddOn.findMany({ where: { eventId: event.id, churchId: auth.churchId }, orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }] }),
    loadEventStats(auth.churchId, [event.id]),
  ]);

  const local = (d: Date | null) => (d ? utcToZonedLocal(d, event.timezone) : "");
  return NextResponse.json({
    event: {
      id: event.id,
      slug: event.slug,
      publicUrl: publicEventUrl(event.slug),
      embedOrigin: appOrigin(),
      name: event.name,
      description: event.description ?? "",
      coverImageUrl: event.coverImageUrl ?? "",
      status: event.status,
      timezone: event.timezone,
      startsAtLocal: local(event.startsAt),
      endsAtLocal: local(event.endsAt),
      registrationOpensAtLocal: local(event.registrationOpensAt),
      registrationClosesAtLocal: local(event.registrationClosesAt),
      locationName: event.locationName ?? "",
      locationAddress: event.locationAddress ?? "",
      priceCents: event.priceCents,
      priceMode: event.priceMode,
      registrationFmvCents: event.registrationFmvCents,
      allowOptionalDonation: event.allowOptionalDonation,
      donationPrompt: event.donationPrompt ?? "",
      allowMultipleAttendees: event.allowMultipleAttendees,
      maxAttendeesPerRegistration: event.maxAttendeesPerRegistration,
      attendeeEmailRequired: event.attendeeEmailRequired,
      collectAttendeePhone: event.collectAttendeePhone,
      registrantPhoneRequired: event.registrantPhoneRequired,
      allowGroups: event.allowGroups,
      groupLabel: event.groupLabel,
      groupRequired: event.groupRequired,
      mailingAddressMode: event.mailingAddressMode,
      confirmationMessage: event.confirmationMessage ?? "",
      customFields: parseCustomFields(event.customFieldsJson),
      emailTemplates: parseEmailTemplates(event.emailTemplatesJson),
      reminderSentAt: event.reminderSentAt?.toISOString() ?? null,
      thankYouSentAt: event.thankYouSentAt?.toISOString() ?? null,
      startsAt: event.startsAt.toISOString(),
    },
    addOns: addOns.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description ?? "",
      priceCents: a.priceCents,
      fmvCents: a.fmvCents,
      maxQuantity: a.maxQuantity,
      isActive: a.isActive,
    })),
    stats: stats.get(event.id),
  });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const guard = await guardEventsRoute("canManageEvents");
  if ("response" in guard) return guard.response;
  const { auth } = guard;
  const { eventId } = await params;

  const event = await loadOwnedEvent(auth.churchId, eventId);
  if (!event || event.archivedAt) return notFoundResponse();

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return validationError("Invalid request.");
  const input = body as Record<string, unknown>;

  const settings = validateEventSettings(input);
  if (!settings.ok) return validationError(settings.error);
  const addOns = input.addOns === undefined ? null : validateAddOns(input.addOns);
  if (addOns && !addOns.ok) return validationError(addOns.error);

  const { customFields, ...data } = settings.data;

  // Events created before a link existed (or whose link was removed) get a
  // fresh dedicated one rather than failing the save.
  let givingLinkId = event.givingLinkId;
  if (givingLinkId) {
    const owned = await prisma.givingLink.findFirst({ where: { id: givingLinkId, churchId: auth.churchId }, select: { id: true } });
    if (!owned) givingLinkId = null;
  }
  if (!givingLinkId) {
    givingLinkId = await provisionEventGivingLink({
      churchId: auth.churchId,
      ownerUserId: auth.userId,
      event: { name: data.name, status: data.status, mailingAddressMode: data.mailingAddressMode, registrantPhoneRequired: data.registrantPhoneRequired },
    });
  }

  await prisma.event.update({
    where: { id: event.id },
    data: { ...data, customFieldsJson: customFields as unknown as Prisma.InputJsonValue, givingLinkId },
  });
  await syncEventGivingLink(auth.churchId, givingLinkId, {
    name: data.name,
    status: data.status,
    mailingAddressMode: data.mailingAddressMode,
    registrantPhoneRequired: data.registrantPhoneRequired,
  });

  if (addOns && addOns.ok) {
    const existing = await prisma.eventAddOn.findMany({ where: { eventId: event.id, churchId: auth.churchId }, select: { id: true } });
    const existingIds = new Set(existing.map((a) => a.id));
    const keptIds = new Set<string>();
    for (const [i, a] of addOns.addOns.entries()) {
      const fields = {
        name: a.name,
        description: a.description,
        priceCents: a.priceCents,
        fmvCents: a.fmvCents,
        maxQuantity: a.maxQuantity,
        isActive: a.isActive,
        displayOrder: i,
      };
      if (a.id && existingIds.has(a.id)) {
        keptIds.add(a.id);
        await prisma.eventAddOn.updateMany({ where: { id: a.id, eventId: event.id, churchId: auth.churchId }, data: fields });
      } else {
        await prisma.eventAddOn.create({ data: { ...fields, churchId: auth.churchId, eventId: event.id } });
      }
    }
    // Past registrations snapshot add-on names/prices, so removing one from
    // the form just deactivates it rather than deleting history.
    const removed = [...existingIds].filter((id) => !keptIds.has(id));
    if (removed.length > 0) {
      await prisma.eventAddOn.updateMany({ where: { id: { in: removed }, eventId: event.id, churchId: auth.churchId }, data: { isActive: false } });
    }
  }

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "event.updated",
    entityType: "event",
    entityId: event.id,
    metadata: { name: data.name, status: data.status },
    req,
  });

  return NextResponse.json({ success: true });
}

/** "Delete" archives: registrations, payments and receipts must remain intact for the merchant's records. */
export async function DELETE(req: Request, { params }: Ctx) {
  const guard = await guardEventsRoute("canManageEvents");
  if ("response" in guard) return guard.response;
  const { auth } = guard;
  const { eventId } = await params;

  const event = await loadOwnedEvent(auth.churchId, eventId);
  if (!event || event.archivedAt) return notFoundResponse();

  await prisma.event.update({ where: { id: event.id }, data: { status: "ARCHIVED", archivedAt: new Date() } });
  await syncEventGivingLink(auth.churchId, event.givingLinkId, {
    name: event.name,
    status: "ARCHIVED",
    mailingAddressMode: event.mailingAddressMode,
    registrantPhoneRequired: event.registrantPhoneRequired,
  });
  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "event.archived",
    entityType: "event",
    entityId: event.id,
    req,
  });
  return NextResponse.json({ success: true });
}
