import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthError } from "@/lib/auth/errors";
import { validateGivingLinkReassignment } from "@/lib/auth/givingLinkOwnership";
import { guardEventsRoute, loadOwnedEvent } from "@/lib/eventRegistration/merchantGuard";
import { logDashboardAction } from "@/lib/dashboardAudit";

/**
 * Assigns an event to a team member (e.g. a fundraiser) so its gifts are
 * credited to them. An event's gifts are attributed through the owner of the
 * giving pages the event charges through: its ticket page and, when the
 * event created one for itself, its donation page. This sets that owner.
 *
 * Same rules as reassigning any giving page (validateGivingLinkReassignment):
 * owners, or admins who can edit all giving pages, to an active member of
 * this organization. Only future gifts are affected; past payments keep the
 * attribution snapshotted when they were made. An organization's own
 * existing giving page picked as the event's donation page is never changed.
 *
 * Body: { userId: string }
 */
export async function PUT(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const guard = await guardEventsRoute("canManageEvents");
  if ("response" in guard) return guard.response;
  const { auth } = guard;
  const { eventId } = await params;

  const body = await req.json().catch(() => ({}));
  const userId = typeof body?.userId === "string" ? body.userId : "";
  if (!userId) return NextResponse.json({ error: "Choose a team member." }, { status: 400 });

  const event = await loadOwnedEvent(auth.churchId, eventId);
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });
  const linkIds = [event.givingLinkId, event.donationLinkIsExisting ? null : event.donationGivingLinkId].filter((id): id is string => !!id);
  if (linkIds.length === 0) {
    return NextResponse.json({ error: "Save the event's ticket settings first, then assign it." }, { status: 409 });
  }

  const links = await prisma.givingLink.findMany({ where: { id: { in: linkIds }, churchId: auth.churchId }, select: { id: true, ownerUserId: true, churchId: true } });
  try {
    for (const link of links) {
      await validateGivingLinkReassignment(auth, { currentOwnerUserId: link.ownerUserId, linkChurchId: link.churchId }, userId);
    }
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const changed = links.filter((l) => l.ownerUserId !== userId);
  if (changed.length > 0) {
    await prisma.givingLink.updateMany({ where: { id: { in: changed.map((l) => l.id) }, churchId: auth.churchId }, data: { ownerUserId: userId } });
    await logDashboardAction({
      churchId: auth.churchId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.rawRole,
      action: "EVENT_FUNDRAISER_ASSIGNED",
      entityType: "Event",
      entityId: event.id,
      metadata: {
        newOwnerUserId: userId,
        givingLinks: changed.map((l) => ({ id: l.id, previousOwnerUserId: l.ownerUserId })),
      },
      req,
    });
  }

  return NextResponse.json({ ok: true });
}
