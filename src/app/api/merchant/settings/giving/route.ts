import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getSettingsPermissions } from "@/lib/settings/settingsPermissions";
import { isValidEmail } from "@/lib/donors/donorContact";
import { isValidHttpsUrl, normalizeWhitespace } from "@/lib/settings/settingsValidation";
import { logDashboardAction } from "@/lib/dashboardAudit";

export async function GET(req: Request) {
  const session = await getSession();
  const permissions = getSettingsPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canView) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const church = await prisma.church.findUnique({ where: { id: session.churchId } });
  if (!church) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  const givingLinks = await prisma.givingLink.findMany({
    where: { churchId: session.churchId, status: "ACTIVE" },
    select: { id: true, internalName: true, publicTitle: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({
    settings: {
      defaultGivingLinkId: church.defaultGivingLinkId,
      givingTermsUrl: church.givingTermsUrl,
      givingPrivacyUrl: church.givingPrivacyUrl,
      givingSupportEmail: church.givingSupportEmail,
    },
    givingLinks,
  });
}

export async function PATCH(req: Request) {
  const session = await getSession();
  const permissions = getSettingsPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canEdit) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const churchId = session.churchId;
  const body = await req.json();
  const errors: Record<string, string> = {};
  const data: Record<string, unknown> = {};

  if ("defaultGivingLinkId" in body) {
    const linkId = body.defaultGivingLinkId || null;
    if (linkId) {
      const link = await prisma.givingLink.findFirst({ where: { id: linkId, churchId } });
      if (!link) errors.defaultGivingLinkId = "Giving Link not found";
      else data.defaultGivingLinkId = linkId;
    } else {
      data.defaultGivingLinkId = null;
    }
  }
  for (const urlField of ["givingTermsUrl", "givingPrivacyUrl"]) {
    if (!(urlField in body)) continue;
    const url = normalizeWhitespace(body[urlField]);
    if (url && !isValidHttpsUrl(url)) errors[urlField] = "Please enter a valid https:// URL";
    else data[urlField] = url;
  }
  if ("givingSupportEmail" in body) {
    const email = normalizeWhitespace(body.givingSupportEmail);
    if (email && !isValidEmail(email)) errors.givingSupportEmail = "Please enter a valid email address";
    else data.givingSupportEmail = email;
  }

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: "Validation failed", fieldErrors: errors }, { status: 400 });
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const current = await prisma.church.findUnique({ where: { id: churchId } });
  const previousValues: Record<string, unknown> = {};
  for (const key of Object.keys(data)) previousValues[key] = (current as any)?.[key];

  await prisma.church.update({ where: { id: churchId }, data });

  await logDashboardAction({
    churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "settings.giving_updated",
    entityType: "church",
    entityId: churchId,
    metadata: { section: "Giving", changedFields: Object.keys(data), previousValues, newValues: data },
    req,
  });

  return NextResponse.json({ success: true });
}
