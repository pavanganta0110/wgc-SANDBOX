import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { validationError } from "@/lib/utils/validationError";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { guardEventsRoute } from "@/lib/eventRegistration/merchantGuard";
import { loadEventStats } from "@/lib/eventRegistration/eventStats";
import { validateEventSettings, validateAddOns, publicEventUrl } from "@/lib/eventRegistration/eventConfig";
import { provisionEventGivingLink, provisionEventDonationLink } from "@/lib/eventRegistration/eventGivingLink";
import { generateEventSlug } from "@/lib/eventRegistration/eventSlug";

export async function GET() {
  const guard = await guardEventsRoute("canViewEvents");
  if ("response" in guard) return guard.response;
  const { auth } = guard;

  const events = await prisma.event.findMany({
    where: { churchId: auth.churchId, archivedAt: null },
    orderBy: { startsAt: "desc" },
    take: 200,
  });
  const stats = await loadEventStats(auth.churchId, events.map((e) => e.id));

  return NextResponse.json({
    events: events.map((e) => ({
      id: e.id,
      slug: e.slug,
      name: e.name,
      status: e.status,
      startsAt: e.startsAt.toISOString(),
      timezone: e.timezone,
      priceCents: e.priceCents,
      publicUrl: publicEventUrl(e.slug),
      stats: stats.get(e.id),
    })),
  });
}

export async function POST(req: Request) {
  const guard = await guardEventsRoute("canManageEvents");
  if ("response" in guard) return guard.response;
  const { auth } = guard;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return validationError("Invalid request.");

  const settings = validateEventSettings(body as Record<string, unknown>);
  if (!settings.ok) return validationError(settings.error);
  const addOns = validateAddOns((body as Record<string, unknown>).addOns);
  if (!addOns.ok) return validationError(addOns.error);

  const { customFields, paymentMethods, ...data } = settings.data;
  const slug = await generateEventSlug(data.name);

  const givingLinkId = await provisionEventGivingLink({
    churchId: auth.churchId,
    ownerUserId: auth.userId,
    event: { name: data.name, status: data.status, mailingAddressMode: data.mailingAddressMode, registrantPhoneRequired: data.registrantPhoneRequired, paymentMethods },
  });
  const donationGivingLinkId = data.allowRecurringDonation
    ? await provisionEventDonationLink({ churchId: auth.churchId, ownerUserId: auth.userId, event: { name: data.name, status: data.status, hostName: data.hostName, enabled: true } })
    : null;

  let event;
  try {
    event = await prisma.event.create({
      data: {
        ...data,
        churchId: auth.churchId,
        slug,
        customFieldsJson: customFields as unknown as Prisma.InputJsonValue,
        paymentMethodsJson: paymentMethods,
        givingLinkId,
        donationGivingLinkId,
        ...(data.status === "ACTIVE" ? { publishedAt: new Date() } : {}),
        createdByUserId: auth.userId,
      },
    });
    if (addOns.addOns.length > 0) {
      await prisma.eventAddOn.createMany({
        data: addOns.addOns.map((a, i) => ({
          churchId: auth.churchId,
          eventId: event!.id,
          name: a.name,
          description: a.description,
          priceCents: a.priceCents,
          fmvCents: a.fmvCents,
          maxQuantity: a.maxQuantity,
          isActive: a.isActive,
          displayOrder: i,
        })),
      });
    }
  } catch (err) {
    // Don't leave a live, orphaned dedicated link behind a failed create.
    await prisma.givingLink.updateMany({ where: { id: { in: [givingLinkId, donationGivingLinkId].filter((id): id is string => Boolean(id)) }, churchId: auth.churchId }, data: { status: "ARCHIVED" } }).catch(() => undefined);
    throw err;
  }

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "event.created",
    entityType: "event",
    entityId: event.id,
    metadata: { name: event.name, priceCents: event.priceCents },
    req,
  });

  return NextResponse.json({ event: { id: event.id, slug: event.slug, publicUrl: publicEventUrl(event.slug) } }, { status: 201 });
}
