import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrganizationPermissions } from "@/lib/organization/organizationPermissions";
import { isValidEmail } from "@/lib/donors/donorContact";
import { normalizeWhitespace } from "@/lib/settings/settingsValidation";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";

const VALID_ROLES = ["PRIMARY", "FINANCE", "TECHNICAL", "SUPPORT", "AUTHORIZED_SIGNER", "STATEMENT", "SECURITY"];

export async function GET() {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getOrganizationPermissions(auth.rawRole);
  if (!permissions.canView) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const contacts = await prisma.organizationContact.findMany({ where: { churchId: auth.churchId }, orderBy: { createdAt: "asc" } });
  return NextResponse.json({ contacts });
}

export async function POST(req: Request) {
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

  const body = await req.json();
  const name = normalizeWhitespace(body.name);
  const role = body.role;

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!VALID_ROLES.includes(role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  if (body.email && !isValidEmail(body.email)) return NextResponse.json({ error: "Invalid email" }, { status: 400 });

  const contact = await prisma.organizationContact.create({
    data: {
      churchId: auth.churchId,
      name,
      role,
      email: normalizeWhitespace(body.email),
      phone: normalizeWhitespace(body.phone),
      isPrimary: !!body.isPrimary,
    },
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "organization.contact_added",
    entityType: "organization_contact",
    entityId: contact.id,
    metadata: { role },
    req,
  });

  return NextResponse.json({ contact }, { status: 201 });
}
