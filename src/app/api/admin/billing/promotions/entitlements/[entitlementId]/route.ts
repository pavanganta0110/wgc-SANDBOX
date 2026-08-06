import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";
import { resolveWgcAdminBillingPermissions } from "@/lib/auth/billingAdminPermissions";
import { logBillingAuditEvent } from "@/lib/billing/billingAudit";

/**
 * Extend/shorten an entitlement's endsAt, or cancel it outright. Never
 * deletes the row — cancellation is a status + canceledAt/canceledByUserId
 * update, same immutable-history posture as the rest of billing.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ entitlementId: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { permissionsJson: true } });
  const perms = resolveWgcAdminBillingPermissions(session.role, user?.permissionsJson);
  if (!perms.canGrantFreeMonths) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { entitlementId } = await params;
  const body = await req.json().catch(() => ({}));
  const { action, newEndsAt, confirmed, reason } = body;

  if (!["extend", "shorten", "cancel"].includes(action)) {
    return NextResponse.json({ error: "action must be one of extend, shorten, cancel." }, { status: 400 });
  }
  if (!confirmed) {
    return NextResponse.json({ error: "Confirmation is required." }, { status: 400 });
  }
  if (!reason || typeof reason !== "string" || !reason.trim()) {
    return NextResponse.json({ error: "A reason is required." }, { status: 400 });
  }

  const existing = await prisma.promotionEntitlement.findUnique({ where: { id: entitlementId } });
  if (!existing) return NextResponse.json({ error: "Entitlement not found." }, { status: 404 });

  let updated;
  let auditAction: string;
  const previousValue = { status: existing.status, endsAt: existing.endsAt };

  if (action === "cancel") {
    auditAction = "promotion_entitlement.canceled";
    updated = await prisma.promotionEntitlement.update({
      where: { id: entitlementId },
      data: { status: "CANCELED", canceledAt: new Date(), canceledByUserId: session.userId },
    });
  } else {
    if (!newEndsAt || Number.isNaN(new Date(newEndsAt).getTime())) {
      return NextResponse.json({ error: "A valid newEndsAt date is required to extend or shorten." }, { status: 400 });
    }
    auditAction = action === "extend" ? "promotion_entitlement.extended" : "promotion_entitlement.shortened";
    updated = await prisma.promotionEntitlement.update({
      where: { id: entitlementId },
      data: { endsAt: new Date(newEndsAt) },
    });
  }

  await logBillingAuditEvent({
    organizationId: existing.organizationId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: auditAction,
    entityType: "PromotionEntitlement",
    entityId: entitlementId,
    previousValue,
    newValue: { status: updated.status, endsAt: updated.endsAt },
    internalReason: reason,
  });

  return NextResponse.json({ success: true, entitlement: updated });
}
