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

  const promotion = await prisma.promotion.findUnique({ where: { id: lead.promotionId } });
  if (!promotion || !promotion.active) return null;

  // PromotionEntitlement.originalLeadId has no @unique constraint (a
  // deliberate schema choice — see the model comment), so the
  // check-then-create below isn't backed by a DB constraint. Two Finix
  // events for the same merchant landing milliseconds apart (confirmed to
  // happen in production — see provisionChurchAccount.ts) could otherwise
  // both pass the findFirst check before either had written a row,
  // granting the promo twice. pg_try_advisory_xact_lock makes the
  // check-and-claim atomic, same pattern as provisionChurchAccount.ts and
  // sendWebhookEmail — a losing concurrent caller re-reads and returns the
  // winner's row instead of creating a second one.
  const lockKey = `promotion-entitlement:${lead.id}`;
  const entitlement = await prisma.$transaction(async (tx) => {
    const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext(${lockKey})) AS locked`;

    // Idempotent — a duplicate/replayed approval webhook must never create
    // a second entitlement for the same lead. Checked even when the lock
    // wasn't acquired: the winning concurrent call may already have
    // committed its row by the time we get here.
    const existing = await tx.promotionEntitlement.findFirst({ where: { originalLeadId: lead.id } });
    if (existing) return existing;
    if (!locked) return null;

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

  if (!entitlement) return null;
  return { entitlementId: entitlement.id, promotionId: entitlement.promotionId };
}
