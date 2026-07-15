import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getOrganizationPermissions } from "@/lib/organization/organizationPermissions";
import { logDashboardAction } from "@/lib/dashboardAudit";

export async function DELETE(req: Request, { params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  const session = await getSession();
  const permissions = getOrganizationPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canManageContacts) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contact = await prisma.organizationContact.findUnique({ where: { id: contactId } });
  if (!contact || contact.churchId !== session.churchId) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  await prisma.organizationContact.delete({ where: { id: contact.id } });

  await logDashboardAction({
    churchId: session.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "organization.contact_removed",
    entityType: "organization_contact",
    entityId: contact.id,
    metadata: { role: contact.role },
    req,
  });

  return NextResponse.json({ success: true });
}
