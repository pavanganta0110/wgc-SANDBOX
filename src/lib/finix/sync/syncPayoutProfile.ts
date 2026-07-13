import { finixClient } from "@/lib/finix/client";
import { prisma } from "@/lib/prisma";
import { redactFinixPayload } from "@/lib/finix/redact";

/**
 * Read-only inspection of Finix's Payout Profile resource for a church's
 * merchant. Chain: GET /merchants/{id} -> merchant_profile id ->
 * GET /merchant_profiles/{id} -> payout_profile id (both confirmed present
 * in real responses via syncFeeProfiles.ts) -> GET /payout_profiles/{id}
 * (new — response shape unconfirmed). This never writes to Finix and never
 * assumes a field name on the response; it just records the raw payload so
 * a human (or a later, confirmed integration) can see what's actually
 * there before any write path is built against it.
 */
export async function syncPayoutProfileForChurch(churchId: string, finixMerchantId: string) {
  const merchant = await finixClient.getMerchant(finixMerchantId);
  if (!merchant?.merchant_profile) return null;

  const merchantProfile = await finixClient.getMerchantProfile(merchant.merchant_profile);
  const payoutProfileId = merchantProfile?.payout_profile;
  if (!payoutProfileId) return null;

  const payoutProfile = await finixClient.getPayoutProfile(payoutProfileId);

  await prisma.finixPayoutProfileSnapshot.upsert({
    where: { finixPayoutProfileId: payoutProfileId },
    create: {
      finixPayoutProfileId: payoutProfileId,
      churchId,
      rawJsonRedacted: redactFinixPayload(payoutProfile),
      createdAtFinix: payoutProfile?.created_at ? new Date(payoutProfile.created_at) : null,
      updatedAtFinix: payoutProfile?.updated_at ? new Date(payoutProfile.updated_at) : null,
      lastSyncedAt: new Date(),
    },
    update: {
      churchId,
      rawJsonRedacted: redactFinixPayload(payoutProfile),
      updatedAtFinix: payoutProfile?.updated_at ? new Date(payoutProfile.updated_at) : null,
      lastSyncedAt: new Date(),
    },
  });

  return payoutProfile;
}
