import { prisma } from "@/lib/prisma";
import { findPromotionLeadByOnboardingApplication } from "@/lib/billing/promotionAttribution";

/**
 * Called once, at Finix-approval time (provisionChurchAccount has just
 * created the organization's Church row), to attach a PromotionEntitlement
 * if — and only if — this organization's signup was attributed to a
 * PromotionLead via the trusted /six-months-free flow. A normal signup has
 * no lead and this is a silent no-op.
 *
 * Snapshots the Promotion template's terms onto the entitlement at grant
 * time (durationMonths, normalMonthlyAmountCents, the three waiver flags)
 * so a later admin edit to the Promotion row never retroactively changes
 * an already-granted entitlement.
 *
 * The six-month period itself has NOT started yet here — that only begins
 * once the Finix subscription is actually created with its trial (see
 * billingActivation flow) — this only marks the entitlement as existing
 * and awaiting billing setup, consistent with "underwriting delays must
 * never consume the free period."
 */
export async function attachPromotionEntitlementIfLeadExists(
  onboardingApplicationId: string,
  organizationId: string,
): Promise<{ entitlementId: string; promotionId: string } | null> {
  const lead = await findPromotionLeadByOnboardingApplication(onboardingApplicationId);
  if (!lead) return null;

  // Idempotent — a duplicate/replayed approval webhook must never create a
  // second entitlement for the same lead.
  const existing = await prisma.promotionEntitlement.findFirst({ where: { originalLeadId: lead.id } });
  if (existing) return { entitlementId: existing.id, promotionId: existing.promotionId };

  const promotion = await prisma.promotion.findUnique({ where: { id: lead.promotionId } });
  if (!promotion || !promotion.active) return null;

  const entitlement = await prisma.$transaction(async (tx) => {
    const created = await tx.promotionEntitlement.create({
      data: {
        organizationId,
        promotionId: promotion.id,
        source: "LANDING_PAGE_AUTOMATIC",
        status: "AWAITING_BILLING_SETUP",
        durationMonths: promotion.durationMonths,
        normalMonthlyAmountCents: promotion.normalMonthlyAmountCents,
        waivesPlatformFee: promotion.promotionWaivesPlatformFee,
        waivesInvoiceMonthlyFee: promotion.promotionWaivesInvoiceMonthlyFee,
        waivesInvoiceUsageFee: promotion.promotionWaivesInvoiceUsageFee,
        originalLeadId: lead.id,
      },
    });
    await tx.promotionLead.update({
      where: { id: lead.id },
      data: { organizationId, status: "ACCOUNT_CREATED", lastActivityAt: new Date() },
    });
    return created;
  });

  return { entitlementId: entitlement.id, promotionId: entitlement.promotionId };
}
