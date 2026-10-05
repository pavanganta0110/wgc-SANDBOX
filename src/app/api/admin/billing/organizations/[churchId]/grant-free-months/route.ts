import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireMfaVerifiedAdminSession } from "@/lib/auth/requireAdminSession";
import { isAuthError } from "@/lib/auth/errors";
import { resolveWgcAdminBillingPermissions } from "@/lib/auth/billingAdminPermissions";
import { logBillingAuditEvent } from "@/lib/billing/billingAudit";
import { ensureSixMonthsFreePromotion } from "@/lib/billing/promotionAttribution";

/**
 * Admin → Billing & Subscriptions → Merchant → Grant Free Months.
 * Current clients receive no automatic promotion — this is the only path
 * that grants one, and it always records source ADMIN_APPROVED_CURRENT_CLIENT
 * (never overwriting the organization's original acquisition source).
 * Requires an internal reason, a customer-facing explanation, is gated on
 * the designated-billing-administrator permission, and requires an
 * MFA-verified session — not every WGC admin can do this, and revenue-
 * impacting actions get the same defense-in-depth as money movement.
 */
export async function POST(req: Request, { params }: { params: Promise<{ churchId: string }> }) {
  let session;
  try {
    session = await requireMfaVerifiedAdminSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { permissionsJson: true } });
  const perms = resolveWgcAdminBillingPermissions(session.role, user?.permissionsJson);
  if (!perms.canGrantFreeMonths) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { churchId } = await params;
  const body = await req.json().catch(() => ({}));
  const months = Number(body.months);
  const internalReason = typeof body.internalReason === "string" ? body.internalReason.trim() : "";
  const customerFacingExplanation = typeof body.customerFacingExplanation === "string" ? body.customerFacingExplanation.trim() : "";
  const confirmed = body.confirmed === true;

  if (!Number.isFinite(months) || months <= 0 || months > 24) {
    return NextResponse.json({ error: "Enter a valid number of free months (1-24)." }, { status: 400 });
  }
  if (!internalReason) {
    return NextResponse.json({ error: "An internal reason is required." }, { status: 400 });
  }
  if (!confirmed) {
    return NextResponse.json({ error: "Confirmation is required for this action." }, { status: 400 });
  }

  const church = await prisma.church.findUnique({ where: { id: churchId } });
  if (!church) return NextResponse.json({ error: "Organization not found." }, { status: 404 });

  const promotion = await ensureSixMonthsFreePromotion();
  const existing = await prisma.promotionEntitlement.findFirst({
    where: { organizationId: churchId, status: { in: ["ACTIVE", "AWAITING_BILLING_SETUP", "ENDING_SOON"] } },
    orderBy: { createdAt: "desc" },
  });

  const reqHeaders = await headers();
  const ipAddress = reqHeaders.get("x-forwarded-for") || reqHeaders.get("x-real-ip") || undefined;

  const entitlement = existing
    ? await prisma.promotionEntitlement.update({
        where: { id: existing.id },
        data: {
          endsAt: existing.endsAt ? new Date(existing.endsAt.getTime() + months * 30 * 24 * 60 * 60 * 1000) : undefined,
          approvalReason: internalReason,
          customerFacingExplanation,
        },
      })
    : await prisma.promotionEntitlement.create({
        data: {
          organizationId: churchId,
          promotionId: promotion.id,
          source: "ADMIN_APPROVED_CURRENT_CLIENT",
          status: "ACTIVE",
          durationMonths: months,
          normalMonthlyAmountCents: promotion.normalMonthlyAmountCents,
          waivesPlatformFee: true,
          waivesInvoiceMonthlyFee: false,
          waivesInvoiceUsageFee: false,
          grantedByUserId: session.userId,
          approvalReason: internalReason,
          customerFacingExplanation,
          startsAt: new Date(),
          endsAt: new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000),
        },
      });

  await logBillingAuditEvent({
    organizationId: churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: existing ? "promotion.extended" : "promotion.granted_current_client",
    entityType: "PromotionEntitlement",
    entityId: entitlement.id,
    internalReason,
    customerFacingReason: customerFacingExplanation,
    newValue: { months, source: "ADMIN_APPROVED_CURRENT_CLIENT" },
    ipAddress,
  });

  return NextResponse.json({ success: true, entitlement });
}
