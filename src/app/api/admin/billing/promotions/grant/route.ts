import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";
import { resolveWgcAdminBillingPermissions } from "@/lib/auth/billingAdminPermissions";
import { logBillingAuditEvent } from "@/lib/billing/billingAudit";

/**
 * Admin-initiated grant of a PromotionEntitlement to a specific
 * organization. Snapshots the Promotion's CURRENT terms onto the new
 * entitlement row at grant time — later edits to the Promotion template
 * never change entitlements already granted (see PromotionEntitlement
 * schema comment).
 */
export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { permissionsJson: true } });
  const perms = resolveWgcAdminBillingPermissions(session.role, user?.permissionsJson);
  if (!perms.canGrantFreeMonths) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { organizationId, promotionId, customerFacingExplanation, confirmed, reason } = body;

  if (!organizationId || typeof organizationId !== "string") {
    return NextResponse.json({ error: "organizationId is required." }, { status: 400 });
  }
  if (!promotionId || typeof promotionId !== "string") {
    return NextResponse.json({ error: "promotionId is required." }, { status: 400 });
  }
  if (!confirmed) {
    return NextResponse.json({ error: "Confirmation is required to grant a promotion." }, { status: 400 });
  }
  if (!reason || typeof reason !== "string" || !reason.trim()) {
    return NextResponse.json({ error: "A reason is required." }, { status: 400 });
  }

  const [organization, promotion] = await Promise.all([
    prisma.church.findUnique({ where: { id: organizationId }, select: { id: true, name: true } }),
    prisma.promotion.findUnique({ where: { id: promotionId } }),
  ]);
  if (!organization) return NextResponse.json({ error: "Organization not found." }, { status: 404 });
  if (!promotion) return NextResponse.json({ error: "Promotion not found." }, { status: 404 });
  if (!promotion.active) return NextResponse.json({ error: "This promotion is deactivated and cannot be newly granted." }, { status: 400 });

  const startsAt = new Date();
  const endsAt = new Date(startsAt);
  if (promotion.durationDays != null) {
    endsAt.setDate(endsAt.getDate() + promotion.durationDays);
  } else {
    endsAt.setMonth(endsAt.getMonth() + promotion.durationMonths);
  }

  const created = await prisma.promotionEntitlement.create({
    data: {
      organizationId,
      promotionId,
      source: "ADMIN_APPROVED_CURRENT_CLIENT",
      status: "ACTIVE",
      durationMonths: promotion.durationMonths,
      durationDays: promotion.durationDays,
      normalMonthlyAmountCents: promotion.normalMonthlyAmountCents,
      waivesPlatformFee: promotion.promotionWaivesPlatformFee,
      waivesInvoiceMonthlyFee: promotion.promotionWaivesInvoiceMonthlyFee,
      waivesInvoiceUsageFee: promotion.promotionWaivesInvoiceUsageFee,
      startsAt,
      endsAt,
      grantedByUserId: session.userId,
      approvalReason: reason,
      customerFacingExplanation: customerFacingExplanation || null,
    },
  });

  await logBillingAuditEvent({
    organizationId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "promotion_entitlement.granted",
    entityType: "PromotionEntitlement",
    entityId: created.id,
    newValue: { promotionId, promotionCode: promotion.code, durationMonths: promotion.durationMonths, startsAt, endsAt },
    internalReason: reason,
    customerFacingReason: customerFacingExplanation || undefined,
  });

  return NextResponse.json({ success: true, entitlement: created });
}
