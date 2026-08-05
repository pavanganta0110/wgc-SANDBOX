import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";
import { resolveWgcAdminBillingPermissions } from "@/lib/auth/billingAdminPermissions";
import { logBillingAuditEvent } from "@/lib/billing/billingAudit";

/** Admin -> Billing & Subscriptions -> Pricing. Never overwrites an
 * existing WgcPricingVersion (pricing versions are permanent, per "do not
 * delete pricing versions already connected to subscriptions or charges")
 * — every change is a NEW version row. New versions default to
 * isDefaultForNewOrgs=false (apply only to new customers who are
 * explicitly pointed at it) unless the admin explicitly marks it default;
 * existing subscriptions always keep pointing at whichever priceVersionId
 * they were created under (see WgcSubscription.priceVersionId), so a new
 * version here can never retroactively change an existing customer's
 * price. */
export async function GET() {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { permissionsJson: true } });
  const perms = resolveWgcAdminBillingPermissions(session.role, user?.permissionsJson);
  if (!perms.canViewBilling) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const versions = await prisma.wgcPricingVersion.findMany({ orderBy: { effectiveFrom: "desc" } });
  return NextResponse.json({ versions });
}

export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { permissionsJson: true } });
  const perms = resolveWgcAdminBillingPermissions(session.role, user?.permissionsJson);
  if (!perms.canManagePricing) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { planCode, planName, monthlyAmountCents, effectiveFrom, isDefaultForNewOrgs, customerDescription, internalDescription, confirmed } = body;

  if (!planCode || !planName || !Number.isFinite(monthlyAmountCents) || monthlyAmountCents < 0) {
    return NextResponse.json({ error: "planCode, planName, and a valid monthlyAmountCents are required." }, { status: 400 });
  }
  if (!confirmed) {
    return NextResponse.json({ error: "Confirmation is required to activate a new pricing version." }, { status: 400 });
  }

  const created = await prisma.$transaction(async (tx) => {
    if (isDefaultForNewOrgs) {
      // Only one version may be the default for new organizations at a
      // time — deactivate the previous default's "default" flag without
      // touching its status/existing-subscription linkage.
      await tx.wgcPricingVersion.updateMany({
        where: { planCode, isDefaultForNewOrgs: true },
        data: { isDefaultForNewOrgs: false },
      });
    }
    return tx.wgcPricingVersion.create({
      data: {
        planCode,
        planName,
        monthlyAmountCents,
        currency: "USD",
        billingInterval: "MONTHLY",
        effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
        isDefaultForNewOrgs: Boolean(isDefaultForNewOrgs),
        status: "ACTIVE",
        customerDescription: customerDescription || null,
        internalDescription: internalDescription || null,
        createdByUserId: session.userId,
      },
    });
  });

  await logBillingAuditEvent({
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "pricing.version_created",
    entityType: "WgcPricingVersion",
    entityId: created.id,
    newValue: { planCode, monthlyAmountCents, isDefaultForNewOrgs: Boolean(isDefaultForNewOrgs) },
    internalReason: body.reason || undefined,
  });

  return NextResponse.json({ success: true, version: created });
}
