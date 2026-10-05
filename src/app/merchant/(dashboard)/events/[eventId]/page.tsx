import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { hasPermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { prisma } from "@/lib/prisma";
import EventDetailClient from "@/components/events/merchant/EventDetailClient";
import { loadOrganizationBrand } from "@/lib/eventRegistration/organizationBrand";

export default async function EventDetailPage({ params }: { params: Promise<{ eventId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/login");
    throw err;
  }
  if (!hasPermission(auth, "canViewEvents")) redirect("/merchant/dashboard");

  const { eventId } = await params;
  const event = await prisma.event.findFirst({ where: { id: eventId, churchId: auth.churchId, archivedAt: null }, select: { id: true, givingLinkId: true } });
  if (!event) notFound();
  const organization = await loadOrganizationBrand(auth.churchId, event.givingLinkId);

  return (
    <div>
      <Link href="/merchant/events" className="text-sm text-indigo-600 hover:underline">← Events</Link>
      <EventDetailClient
        eventId={event.id}
        organization={organization}
        canManage={hasPermission(auth, "canManageEvents")}
        canManageAttendees={hasPermission(auth, "canManageEventAttendees")}
        canExport={hasPermission(auth, "canExportEvents")}
      />
    </div>
  );
}
