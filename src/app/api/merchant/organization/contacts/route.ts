import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getOrganizationPermissions } from "@/lib/organization/organizationPermissions";
import { isValidEmail } from "@/lib/donors/donorContact";
import { normalizeWhitespace } from "@/lib/settings/settingsValidation";
import { logDashboardAction } from "@/lib/dashboardAudit";

const VALID_ROLES = ["PRIMARY", "FINANCE", "TECHNICAL", "SUPPORT", "AUTHORIZED_SIGNER", "STATEMENT", "SECURITY"];

export async function GET() {
  const session = await getSession();
  const permissions = getOrganizationPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canView) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const contacts = await prisma.organizationContact.findMany({ where: { churchId: session.churchId }, orderBy: { createdAt: "asc" } });
  return NextResponse.json({ contacts });
}

export async function POST(req: Request) {
  const session = await getSession();
  const permissions = getOrganizationPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canManageContacts) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const name = normalizeWhitespace(body.name);
  const role = body.role;

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!VALID_ROLES.includes(role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  if (body.email && !isValidEmail(body.email)) return NextResponse.json({ error: "Invalid email" }, { status: 400 });

  const contact = await prisma.organizationContact.create({
    data: {
      churchId: session.churchId,
      name,
      role,
      email: normalizeWhitespace(body.email),
      phone: normalizeWhitespace(body.phone),
      isPrimary: !!body.isPrimary,
    },
  });

  await logDashboardAction({
    churchId: session.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "organization.contact_added",
    entityType: "organization_contact",
    entityId: contact.id,
    metadata: { role },
    req,
  });

  return NextResponse.json({ contact }, { status: 201 });
}
