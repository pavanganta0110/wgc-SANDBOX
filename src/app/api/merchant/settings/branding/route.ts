import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getSettingsPermissions } from "@/lib/settings/settingsPermissions";
import { isValidHttpsUrl, buildPartialUpdate } from "@/lib/settings/settingsValidation";
import { logDashboardAction } from "@/lib/dashboardAudit";

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

function isValidHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR_PATTERN.test(value);
}

export async function GET() {
  const session = await getSession();
  const permissions = getSettingsPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canView) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const church = await prisma.church.findUnique({
    where: { id: session.churchId },
    select: { logoUrl: true, faviconUrl: true, primaryColor: true, secondaryColor: true, accentColor: true },
  });
  return NextResponse.json({ branding: church });
}

export async function PATCH(req: Request) {
  const session = await getSession();
  const permissions = getSettingsPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canManageBranding) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  if (body.logoUrl && !isValidHttpsUrl(body.logoUrl)) {
    return NextResponse.json({ error: "Logo URL must be a valid https:// URL" }, { status: 400 });
  }
  if (body.faviconUrl && !isValidHttpsUrl(body.faviconUrl)) {
    return NextResponse.json({ error: "Favicon URL must be a valid https:// URL" }, { status: 400 });
  }
  for (const key of ["primaryColor", "secondaryColor", "accentColor"]) {
    if (body[key] && !isValidHexColor(body[key])) {
      return NextResponse.json({ error: `${key} must be a hex color (e.g. #0B5DBC)` }, { status: 400 });
    }
  }

  const update = buildPartialUpdate<{
    logoUrl: string | null;
    faviconUrl: string | null;
    primaryColor: string | null;
    secondaryColor: string | null;
    accentColor: string | null;
  }>(body, ["logoUrl", "faviconUrl", "primaryColor", "secondaryColor", "accentColor"]);

  const church = await prisma.church.update({ where: { id: session.churchId }, data: update });

  await logDashboardAction({
    churchId: session.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "settings.branding_updated",
    entityType: "church",
    entityId: session.churchId,
    metadata: { updatedFields: Object.keys(update) },
    req,
  });

  return NextResponse.json({
    branding: {
      logoUrl: church.logoUrl,
      faviconUrl: church.faviconUrl,
      primaryColor: church.primaryColor,
      secondaryColor: church.secondaryColor,
      accentColor: church.accentColor,
    },
  });
}
