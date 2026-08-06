import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";
import { resolveWgcAdminBillingPermissions } from "@/lib/auth/billingAdminPermissions";
import { logBillingAuditEvent } from "@/lib/billing/billingAudit";

/**
 * Admin -> Billing & Subscriptions -> Settings. WgcBillingSettings is a
 * singleton (id always "singleton") — GET upserts the default row into
 * existence on first read so the UI always has something to show.
 */
export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { permissionsJson: true } });
  const perms = resolveWgcAdminBillingPermissions(session.role, user?.permissionsJson);
  if (!perms.canViewBilling) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const settings = await prisma.wgcBillingSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });

  return NextResponse.json({ settings });
}

export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { permissionsJson: true } });
  const perms = resolveWgcAdminBillingPermissions(session.role, user?.permissionsJson);
  if (!perms.canManageBilling) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { gracePeriodDays, pastDueReminderDays, trialEndingReminderDays, restrictedFeatureKeys, supportContactEmail, confirmed, reason } = body;

  if (!Number.isFinite(gracePeriodDays) || gracePeriodDays < 0) {
    return NextResponse.json({ error: "gracePeriodDays must be a non-negative number." }, { status: 400 });
  }
  if (!Array.isArray(pastDueReminderDays) || !pastDueReminderDays.every((d: unknown) => Number.isFinite(d))) {
    return NextResponse.json({ error: "pastDueReminderDays must be a list of numbers." }, { status: 400 });
  }
  if (!Array.isArray(trialEndingReminderDays) || !trialEndingReminderDays.every((d: unknown) => Number.isFinite(d))) {
    return NextResponse.json({ error: "trialEndingReminderDays must be a list of numbers." }, { status: 400 });
  }
  if (!Array.isArray(restrictedFeatureKeys) || !restrictedFeatureKeys.every((k: unknown) => typeof k === "string")) {
    return NextResponse.json({ error: "restrictedFeatureKeys must be a list of strings." }, { status: 400 });
  }
  if (!confirmed) {
    return NextResponse.json({ error: "Confirmation is required to change billing settings." }, { status: 400 });
  }
  if (!reason || typeof reason !== "string" || !reason.trim()) {
    return NextResponse.json({ error: "A reason is required." }, { status: 400 });
  }

  const previous = await prisma.wgcBillingSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });

  const updated = await prisma.wgcBillingSettings.update({
    where: { id: "singleton" },
    data: {
      gracePeriodDays,
      pastDueReminderDays,
      trialEndingReminderDays,
      restrictedFeatureKeys,
      supportContactEmail: supportContactEmail || null,
      updatedByUserId: session.userId,
    },
  });

  await logBillingAuditEvent({
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "billing_settings.updated",
    entityType: "WgcBillingSettings",
    entityId: "singleton",
    previousValue: {
      gracePeriodDays: previous.gracePeriodDays,
      pastDueReminderDays: previous.pastDueReminderDays,
      trialEndingReminderDays: previous.trialEndingReminderDays,
      restrictedFeatureKeys: previous.restrictedFeatureKeys,
      supportContactEmail: previous.supportContactEmail,
    },
    newValue: {
      gracePeriodDays: updated.gracePeriodDays,
      pastDueReminderDays: updated.pastDueReminderDays,
      trialEndingReminderDays: updated.trialEndingReminderDays,
      restrictedFeatureKeys: updated.restrictedFeatureKeys,
      supportContactEmail: updated.supportContactEmail,
    },
    internalReason: reason,
  });

  return NextResponse.json({ success: true, settings: updated });
}
