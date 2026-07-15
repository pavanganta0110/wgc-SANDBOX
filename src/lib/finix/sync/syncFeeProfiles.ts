import { finixClient } from "@/lib/finix/client";
import { prisma } from "@/lib/prisma";
import { redactFinixPayload } from "@/lib/finix/redact";

/**
 * WGC fee sync layer. Rates are set entirely in Finix's dashboard
 * (Merchants -> Merchant Accounts -> Account Settings -> Fee Profile) —
 * WGC has no pricing UI of its own. This keeps our DB in sync via webhooks
 * (fee_profile.*, merchant_profile.*) so the church_admin dashboard and the
 * giving-page fee calculator can read fast without an API round-trip per
 * request, while still reflecting Finix as the single source of truth.
 *
 * Chain confirmed against the real sandbox API:
 *   GET /merchants/{id} -> merchant_profile id
 *   GET /merchant_profiles/{id} -> fee_profile id (nullable — falls back to
 *     the application's default fee profile if unset)
 *   GET /fee_profiles/{id} -> basis_points, fixed_fee, ach_fixed_fee
 */

async function upsertFeeProfileSnapshot(feeProfileId: string) {
  const feeProfile = await finixClient.getFeeProfile(feeProfileId);

  await prisma.finixFeeProfile.upsert({
    where: { finixFeeProfileId: feeProfileId },
    create: {
      finixFeeProfileId: feeProfileId,
      basisPoints: feeProfile.basis_points ?? null,
      fixedFeeCents: feeProfile.fixed_fee ?? null,
      achBasisPoints: feeProfile.ach_basis_points ?? null,
      achFixedFeeCents: feeProfile.ach_fixed_fee ?? null,
      rawJsonRedacted: redactFinixPayload(feeProfile),
      createdAtFinix: feeProfile.created_at ? new Date(feeProfile.created_at) : null,
      updatedAtFinix: feeProfile.updated_at ? new Date(feeProfile.updated_at) : null,
      lastSyncedAt: new Date(),
    },
    update: {
      basisPoints: feeProfile.basis_points ?? null,
      fixedFeeCents: feeProfile.fixed_fee ?? null,
      achBasisPoints: feeProfile.ach_basis_points ?? null,
      achFixedFeeCents: feeProfile.ach_fixed_fee ?? null,
      rawJsonRedacted: redactFinixPayload(feeProfile),
      updatedAtFinix: feeProfile.updated_at ? new Date(feeProfile.updated_at) : null,
      lastSyncedAt: new Date(),
    },
  });

  return feeProfile;
}

async function upsertMerchantProfileSnapshot(merchantProfileId: string) {
  const merchantProfile = await finixClient.getMerchantProfile(merchantProfileId);

  await prisma.finixMerchantProfile.upsert({
    where: { finixMerchantProfileId: merchantProfileId },
    create: {
      finixMerchantProfileId: merchantProfileId,
      finixFeeProfileId: merchantProfile.fee_profile ?? null,
      finixPayoutProfileId: merchantProfile.payout_profile ?? null,
      finixRiskProfileId: merchantProfile.risk_profile ?? null,
      rawJsonRedacted: redactFinixPayload(merchantProfile),
      createdAtFinix: merchantProfile.created_at ? new Date(merchantProfile.created_at) : null,
      updatedAtFinix: merchantProfile.updated_at ? new Date(merchantProfile.updated_at) : null,
      lastSyncedAt: new Date(),
    },
    update: {
      finixFeeProfileId: merchantProfile.fee_profile ?? null,
      finixPayoutProfileId: merchantProfile.payout_profile ?? null,
      finixRiskProfileId: merchantProfile.risk_profile ?? null,
      rawJsonRedacted: redactFinixPayload(merchantProfile),
      updatedAtFinix: merchantProfile.updated_at ? new Date(merchantProfile.updated_at) : null,
      lastSyncedAt: new Date(),
    },
  });

  return merchantProfile;
}

/**
 * Resolves one church's live merchant -> merchant_profile -> fee_profile
 * chain, snapshots both profiles, and writes the flattened rates into
 * ChurchPricing (the table the church-facing dashboard and giving-page fee
 * calculator actually read).
 */
export async function syncChurchPricingForChurch(churchId: string, finixMerchantId: string) {
  const merchant = await finixClient.getMerchant(finixMerchantId);
  if (!merchant?.merchant_profile) {
    return null;
  }

  const merchantProfile = await upsertMerchantProfileSnapshot(merchant.merchant_profile);

  let feeProfileId = merchantProfile?.fee_profile as string | null | undefined;
  if (!feeProfileId) {
    // No merchant-specific override — fall back to the application's
    // shared default fee profile.
    const response = await finixClient.listFeeProfiles();
    const profiles: any[] = response?._embedded?.fee_profiles ?? [];
    feeProfileId = profiles[0]?.id;
  }
  if (!feeProfileId) {
    return null;
  }

  const feeProfile = await upsertFeeProfileSnapshot(feeProfileId);

  const pricing = await prisma.churchPricing.upsert({
    where: { churchId },
    create: {
      churchId,
      pricingPlanName: "WGC Standard Rate",
      cardPercentageFee: typeof feeProfile.basis_points === "number" ? feeProfile.basis_points / 100 : null,
      cardFixedFeeCents: feeProfile.fixed_fee ?? null,
      achFixedFeeCents: feeProfile.ach_fixed_fee ?? null,
    },
    update: {
      cardPercentageFee: typeof feeProfile.basis_points === "number" ? feeProfile.basis_points / 100 : null,
      cardFixedFeeCents: feeProfile.fixed_fee ?? null,
      achFixedFeeCents: feeProfile.ach_fixed_fee ?? null,
    },
  });

  return pricing;
}

/**
 * Refreshes every church's pricing. Used when a fee_profile.* webhook
 * fires — fee profiles don't reference which merchants use them, so on a
 * shared/default profile change we can't target just the affected
 * church(es) without re-resolving each one's chain. Fine at current scale.
 */
export async function syncAllChurchesPricing() {
  const churches = await prisma.church.findMany({
    where: { finixMerchantId: { not: null } },
    select: { id: true, finixMerchantId: true },
  });

  const results = await Promise.allSettled(
    churches.map((c) => syncChurchPricingForChurch(c.id, c.finixMerchantId!))
  );

  return { attempted: churches.length, failed: results.filter((r) => r.status === "rejected").length };
}

/**
 * Refreshes just the church whose merchant currently points at the given
 * merchant_profile id. Used when a merchant_profile.* webhook fires.
 *
 * Note: per Finix's own webhook docs, merchant_profile.updated only
 * reliably fires when the profile's *tags* change — reassigning a
 * different fee_profile to a merchant profile may not trigger this event
 * at all. syncAllChurchesPricing (triggered by fee_profile.* events) is
 * the more reliable signal for rate changes; this is best-effort.
 */
export async function syncChurchPricingForMerchantProfile(merchantProfileId: string) {
  const churches = await prisma.church.findMany({
    where: { finixMerchantId: { not: null } },
    select: { id: true, finixMerchantId: true },
  });

  for (const church of churches) {
    const merchant = await finixClient.getMerchant(church.finixMerchantId!);
    if (merchant?.merchant_profile === merchantProfileId) {
      return syncChurchPricingForChurch(church.id, church.finixMerchantId!);
    }
  }

  return null;
}
