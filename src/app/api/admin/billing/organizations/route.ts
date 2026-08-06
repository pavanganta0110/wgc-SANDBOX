import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";
import { resolveWgcAdminBillingPermissions } from "@/lib/auth/billingAdminPermissions";

/**
 * Admin Billing & Subscriptions — organization list. Every field shown here
 * is read from the database (subscription state, Finix IDs, promotion) —
 * never manually typeable by an admin (see billingAdminPermissions.ts /
 * completion report for the "admins cannot fake a payment status" rule).
 */
export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { permissionsJson: true } });
  const perms = resolveWgcAdminBillingPermissions(session.role, user?.permissionsJson);
  if (!perms.canViewBilling) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const churches = await prisma.church.findMany({
    select: { id: true, name: true, finixMerchantId: true, status: true, billingSetupStatus: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const churchIds = churches.map((c) => c.id);

  const [subscriptions, entitlements, billingAccounts] = await Promise.all([
    prisma.wgcSubscription.findMany({ where: { organizationId: { in: churchIds } } }),
    prisma.promotionEntitlement.findMany({ where: { organizationId: { in: churchIds } }, orderBy: { createdAt: "desc" } }),
    prisma.wgcBillingAccount.findMany({ where: { organizationId: { in: churchIds } } }),
  ]);

  const subByOrg = new Map(subscriptions.map((s) => [s.organizationId, s]));
  const entitlementByOrg = new Map<string, (typeof entitlements)[number]>();
  for (const e of entitlements) {
    if (!entitlementByOrg.has(e.organizationId)) entitlementByOrg.set(e.organizationId, e);
  }
  const billingByOrg = new Map(billingAccounts.map((b) => [b.organizationId, b]));

  const rows = churches.map((c) => {
    const sub = subByOrg.get(c.id);
    const entitlement = entitlementByOrg.get(c.id);
    const billing = billingByOrg.get(c.id);
    return {
      id: c.id,
      name: c.name,
      finixMerchantId: c.finixMerchantId,
      billingSetupStatus: c.billingSetupStatus,
      subscription: sub
        ? {
            id: sub.id,
            finixSubscriptionId: sub.finixSubscriptionId,
            status: sub.status,
            amountCents: sub.amountCents,
            trialStartsAt: sub.trialStartsAt,
            trialEndsAt: sub.trialEndsAt,
            firstChargeAt: sub.firstChargeAt,
            nextChargeAt: sub.nextChargeAt,
            lastChargeAt: sub.lastChargeAt,
            pastDueAt: sub.pastDueAt,
            gracePeriodEndsAt: sub.gracePeriodEndsAt,
          }
        : null,
      promotion: entitlement ? { id: entitlement.id, status: entitlement.status, source: entitlement.source, endsAt: entitlement.endsAt } : null,
      billingMethodType: billing?.billingMethodType ?? null,
      maskedBillingDetails: billing?.maskedBillingDetails ?? null,
    };
  });

  return NextResponse.json({ organizations: rows });
}
