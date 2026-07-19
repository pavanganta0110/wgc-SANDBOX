import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getSettingsPermissions } from "@/lib/settings/settingsPermissions";
import { NOTIFICATION_EVENTS, DEFAULT_NOTIFICATION_PREFERENCE } from "@/lib/settings/notificationEvents";
import { logDashboardAction } from "@/lib/dashboardAudit";

const VALID_FREQUENCIES = ["IMMEDIATE", "DAILY_DIGEST", "WEEKLY_DIGEST"];

export async function GET() {
  const session = await getSession();

  // Team-access Checkpoint 4A: explicit wgc_admin rejection — this route passes
  // session.role into a permission module that has its own wgc_admin branch
  // (for legitimate internal-support use via getSession() elsewhere); without
  // this guard, a wgc_admin session could be admitted here through that back
  // door. requireMerchantSession() (not yet adopted by this route) would
  // reject this unconditionally; this is the minimal-diff equivalent.
  if (session?.role === "wgc_admin") {
    return NextResponse.json({ error: "This route is not available to internal accounts." }, { status: 403 });
  }
  const permissions = getSettingsPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canView) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await prisma.notificationPreference.findMany({ where: { churchId: session.churchId } });
  const byKey = new Map(rows.map((r) => [r.eventKey, r]));

  const preferences = NOTIFICATION_EVENTS.map((event) => {
    const row = byKey.get(event.key);
    return {
      ...event,
      inAppEnabled: row?.inAppEnabled ?? DEFAULT_NOTIFICATION_PREFERENCE.inAppEnabled,
      emailEnabled: row?.emailEnabled ?? DEFAULT_NOTIFICATION_PREFERENCE.emailEnabled,
      frequency: row?.frequency ?? DEFAULT_NOTIFICATION_PREFERENCE.frequency,
    };
  });

  return NextResponse.json({ preferences });
}

export async function PATCH(req: Request) {
  const session = await getSession();
  const permissions = getSettingsPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canEdit) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const updates = Array.isArray(body.preferences) ? body.preferences : [];
  const validKeys = new Set(NOTIFICATION_EVENTS.map((e) => e.key));

  for (const update of updates) {
    if (!validKeys.has(update.eventKey)) continue;
    const frequency = VALID_FREQUENCIES.includes(update.frequency) ? update.frequency : "IMMEDIATE";
    await prisma.notificationPreference.upsert({
      where: { churchId_eventKey: { churchId: session.churchId, eventKey: update.eventKey } },
      create: {
        churchId: session.churchId,
        eventKey: update.eventKey,
        inAppEnabled: !!update.inAppEnabled,
        emailEnabled: !!update.emailEnabled,
        frequency,
      },
      update: {
        inAppEnabled: !!update.inAppEnabled,
        emailEnabled: !!update.emailEnabled,
        frequency,
      },
    });
  }

  await logDashboardAction({
    churchId: session.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "settings.notifications_updated",
    entityType: "church",
    entityId: session.churchId,
    metadata: { updatedKeys: updates.map((u: any) => u.eventKey) },
    req,
  });

  return NextResponse.json({ success: true });
}
