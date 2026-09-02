import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";
import { resolveWgcAdminBillingPermissions } from "@/lib/auth/billingAdminPermissions";
import { logBillingAuditEvent } from "@/lib/billing/billingAudit";

/**
 * Admin -> Billing & Subscriptions -> Promotions. Lists/creates Promotion
 * templates only — never deletes one (see PATCH-style deactivation via
 * `active: false`, which stays a POST-create-new-row-free operation handled
 * elsewhere). Granting/editing a specific organization's entitlement lives
 * in ./grant and ./entitlements/[entitlementId].
 */
export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { permissionsJson: true } });
  const perms = resolveWgcAdminBillingPermissions(session.role, user?.permissionsJson);
  if (!perms.canViewBilling) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const promotions = await prisma.promotion.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ promotions });
}

export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { permissionsJson: true } });
  const perms = resolveWgcAdminBillingPermissions(session.role, user?.permissionsJson);
  if (!perms.canManagePromotions) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const {
    code,
    name,
    customerDescription,
    durationMonths,
    durationDays,
    normalMonthlyAmountCents,
    automaticEligibilitySource,
    maxOrganizations,
    allowManualGrantToExistingOrg,
    promotionWaivesPlatformFee,
    promotionWaivesInvoiceMonthlyFee,
    promotionWaivesInvoiceUsageFee,
    confirmed,
    reason,
  } = body;

  if (!code || typeof code !== "string" || !name || typeof name !== "string") {
    return NextResponse.json({ error: "Code and name are required." }, { status: 400 });
  }
  if (!Number.isFinite(durationMonths) || durationMonths <= 0) {
    return NextResponse.json({ error: "Duration (months) must be a positive number." }, { status: 400 });
  }
  if (durationDays != null && (!Number.isFinite(durationDays) || durationDays <= 0)) {
    return NextResponse.json({ error: "Duration (days) must be a positive number." }, { status: 400 });
  }
  if (!Number.isFinite(normalMonthlyAmountCents) || normalMonthlyAmountCents < 0) {
    return NextResponse.json({ error: "Normal monthly amount is required." }, { status: 400 });
  }
  if (!confirmed) {
    return NextResponse.json({ error: "Confirmation is required to create a promotion." }, { status: 400 });
  }
  if (!reason || typeof reason !== "string" || !reason.trim()) {
    return NextResponse.json({ error: "A reason is required." }, { status: 400 });
  }

  const created = await prisma.promotion.create({
    data: {
      code,
      name,
      customerDescription: customerDescription || null,
      durationMonths,
      durationDays: durationDays != null ? durationDays : null,
      normalMonthlyAmountCents,
      automaticEligibilitySource: automaticEligibilitySource || null,
      maxOrganizations: maxOrganizations != null && Number.isFinite(maxOrganizations) ? maxOrganizations : null,
      allowManualGrantToExistingOrg: Boolean(allowManualGrantToExistingOrg),
      promotionWaivesPlatformFee: promotionWaivesPlatformFee !== false,
      promotionWaivesInvoiceMonthlyFee: Boolean(promotionWaivesInvoiceMonthlyFee),
      promotionWaivesInvoiceUsageFee: Boolean(promotionWaivesInvoiceUsageFee),
      createdByUserId: session.userId,
    },
  });

  await logBillingAuditEvent({
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "promotion.created",
    entityType: "Promotion",
    entityId: created.id,
    newValue: { code, name, durationMonths, normalMonthlyAmountCents },
    internalReason: reason,
  });

  return NextResponse.json({ success: true, promotion: created });
}

export async function PATCH(req: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { permissionsJson: true } });
  const perms = resolveWgcAdminBillingPermissions(session.role, user?.permissionsJson);
  if (!perms.canManagePromotions) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { promotionId, active, confirmed, reason } = body;

  if (!promotionId || typeof promotionId !== "string") {
    return NextResponse.json({ error: "promotionId is required." }, { status: 400 });
  }
  if (typeof active !== "boolean") {
    return NextResponse.json({ error: "active must be a boolean." }, { status: 400 });
  }
  if (!confirmed) {
    return NextResponse.json({ error: "Confirmation is required." }, { status: 400 });
  }
  if (!reason || typeof reason !== "string" || !reason.trim()) {
    return NextResponse.json({ error: "A reason is required." }, { status: 400 });
  }

  const existing = await prisma.promotion.findUnique({ where: { id: promotionId } });
  if (!existing) return NextResponse.json({ error: "Promotion not found." }, { status: 404 });

  const updated = await prisma.promotion.update({ where: { id: promotionId }, data: { active } });

  await logBillingAuditEvent({
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: active ? "promotion.reactivated" : "promotion.deactivated",
    entityType: "Promotion",
    entityId: promotionId,
    previousValue: { active: existing.active },
    newValue: { active },
    internalReason: reason,
  });

  return NextResponse.json({ success: true, promotion: updated });
}
