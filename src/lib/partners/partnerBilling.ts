import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Called when an application that came through a partner is approved and its
 * organization (Church) now exists.
 *
 *  - Links the organization to the partner (and the partner's own reference), so it
 *    shows in the partner's organizations and its gifts reach the partner's ledger.
 *  - Records one billable approval, once. The partner is billed for approved
 *    organizations, not the organization: an organization of a partner has no
 *    subscription of its own (see provisionChurchAndBillingGate).
 *
 * Idempotent: a repeated webhook changes nothing. Never throws, since a failure
 * here must not fail the provisioning that called it; it is logged instead.
 */
export async function attachChurchToPartner(params: {
  churchId: string;
  partnerId: string;
  partnerReference: string | null;
  onboardingApplicationId: string;
  approvedAt?: Date;
}): Promise<void> {
  try {
    const church = await prisma.church.findUnique({ where: { id: params.churchId }, select: { partnerId: true, partnerReference: true } });
    if (!church) return;
    if (church.partnerId && church.partnerId !== params.partnerId) {
      console.error(`attachChurchToPartner: church ${params.churchId} already belongs to another partner; not changed.`);
      return;
    }

    if (church.partnerId !== params.partnerId) {
      try {
        await prisma.church.update({ where: { id: params.churchId }, data: { partnerId: params.partnerId, partnerReference: params.partnerReference } });
      } catch (err) {
        // The partner already uses that reference for another organization: link without it.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          console.error(`attachChurchToPartner: reference "${params.partnerReference}" already used by partner ${params.partnerId}; linked without it.`);
          await prisma.church.update({ where: { id: params.churchId }, data: { partnerId: params.partnerId, partnerReference: null } });
        } else {
          throw err;
        }
      }
    }

    // The unique churchId makes this safe against two deliveries at once: the loser is a no-op.
    await prisma.partnerBillableApproval.upsert({
      where: { churchId: params.churchId },
      create: {
        partnerId: params.partnerId,
        churchId: params.churchId,
        onboardingApplicationId: params.onboardingApplicationId,
        approvedAt: params.approvedAt ?? new Date(),
      },
      update: {},
    });
  } catch (err) {
    console.error(`attachChurchToPartner failed for church=${params.churchId}:`, err);
  }
}
