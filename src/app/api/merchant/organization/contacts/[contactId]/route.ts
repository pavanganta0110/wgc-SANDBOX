import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrganizationPermissions } from "@/lib/organization/organizationPermissions";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";

export async function DELETE(req: Request, { params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getOrganizationPermissions(auth.rawRole);
  if (!permissions.canManageContacts) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contact = await prisma.organizationContact.findUnique({ where: { id: contactId } });
  if (!contact || contact.churchId !== auth.churchId) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  await prisma.organizationContact.delete({ where: { id: contact.id } });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "organization.contact_removed",
    entityType: "organization_contact",
    entityId: contact.id,
    metadata: { role: contact.role },
    req,
  });

  return NextResponse.json({ success: true });
}
