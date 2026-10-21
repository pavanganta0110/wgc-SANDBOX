import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { hasPermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { prisma } from "@/lib/prisma";
import EventDetailClient from "@/components/events/merchant/EventDetailClient";
import EventFundraiserPicker from "@/components/events/merchant/EventFundraiserPicker";
import { loadOrganizationBrand } from "@/lib/eventRegistration/organizationBrand";

export default async function EventDetailPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ created?: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/login");
    throw err;
  }
  if (!hasPermission(auth, "canViewEvents")) redirect("/merchant/dashboard");

  const { eventId } = await params;
  const { created } = await searchParams;
  const event = await prisma.event.findFirst({ where: { id: eventId, churchId: auth.churchId, archivedAt: null }, select: { id: true, givingLinkId: true } });
  if (!event) notFound();
  const organization = await loadOrganizationBrand(auth.churchId, event.givingLinkId);

  // Who this event's gifts are credited to = the owner of its ticket page.
  // Assigning needs event management plus the giving-page reassignment
  // rights enforced by the API (owner, or admin who can edit all pages).
  const canAssign =
    hasPermission(auth, "canManageEvents") && (auth.role === "owner" || (auth.role === "admin" && hasPermission(auth, "canEditAllGivingLinks")));
  const [ticketLink, members] = await Promise.all([
    event.givingLinkId
      ? prisma.givingLink.findFirst({ where: { id: event.givingLinkId, churchId: auth.churchId }, select: { ownerUserId: true } })
      : Promise.resolve(null),
    canAssign
      ? prisma.user.findMany({
          where: { churchId: auth.churchId, disabledAt: null, role: { in: ["owner", "admin", "fundraiser", "church_admin"] } },
          select: { id: true, email: true, name: true, role: true },
          orderBy: [{ role: "asc" }, { email: "asc" }],
        })
      : Promise.resolve([]),
  ]);
  const ownerId = ticketLink?.ownerUserId ?? null;
  const owner = ownerId
    ? members.find((m) => m.id === ownerId) ??
      (await prisma.user.findFirst({ where: { id: ownerId, churchId: auth.churchId }, select: { id: true, email: true, name: true, role: true } }))
    : null;
  const label = (m: { email: string; name: string | null; role: string }) =>
    `${m.name ? `${m.name} · ` : ""}${m.email} (${m.role === "church_admin" ? "admin" : m.role})`;

  return (
    <div>
      <Link href="/merchant/events" className="text-sm text-indigo-600 hover:underline">← Events</Link>
      {event.givingLinkId && (
        <EventFundraiserPicker
          eventId={event.id}
          currentUserId={ownerId}
          currentLabel={owner ? label(owner) : null}
          members={
            canAssign
              ? [...(owner && !members.some((m) => m.id === owner.id) ? [owner] : []), ...members].map((m) => ({ id: m.id, label: label(m) }))
              : undefined
          }
        />
      )}
      <EventDetailClient
        eventId={event.id}
        organization={organization}
        justCreated={created === "draft" || created === "published" ? created : undefined}
        canManage={hasPermission(auth, "canManageEvents")}
        canManageAttendees={hasPermission(auth, "canManageEventAttendees")}
        canExport={hasPermission(auth, "canExportEvents")}
      />
    </div>
  );
}
