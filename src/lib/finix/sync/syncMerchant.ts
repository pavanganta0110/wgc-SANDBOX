import { finixClient } from "@/lib/finix/client";
import { prisma } from "@/lib/prisma";
import { redactFinixPayload } from "@/lib/finix/redact";

/**
 * Pulls the current merchant state from Finix and upserts it into
 * FinixMerchantSnapshot. Additive only — does not touch OnboardingApplication.
 * TODO: confirm exact merchant response fields (risk_state, payout_profile,
 * merchant_profile, fee_profile) once available in Finix's sandbox response.
 */
export async function syncMerchant(finixMerchantId: string, churchId?: string) {
  const merchant = await finixClient.getMerchant(finixMerchantId);

  await prisma.finixMerchantSnapshot.upsert({
    where: { finixMerchantId },
    create: {
      finixMerchantId,
      churchId,
      finixIdentityId: merchant.identity ?? null,
      onboardingState: merchant.onboarding_state ?? null,
      merchantState: merchant.state ?? null,
      processingEnabled: Boolean(merchant.processing_enabled),
      settlementEnabled: Boolean(merchant.settlement_enabled),
      rawStateRedacted: redactFinixPayload(merchant),
      lastSyncedAt: new Date(),
    },
    update: {
      churchId,
      onboardingState: merchant.onboarding_state ?? null,
      merchantState: merchant.state ?? null,
      processingEnabled: Boolean(merchant.processing_enabled),
      settlementEnabled: Boolean(merchant.settlement_enabled),
      rawStateRedacted: redactFinixPayload(merchant),
      lastSyncedAt: new Date(),
    },
  });
}
