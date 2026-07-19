import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";
import { getSettingsPermissions } from "@/lib/settings/settingsPermissions";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requireFullOrganizationContext } from "@/lib/auth";
import { isAuthError } from "@/lib/auth/errors";

/**
 * POST /api/merchant/subscription/sync-pricing
 *
 * Refreshes the ChurchPricing record by walking the Finix chain:
 *   church.finixMerchantId  →  merchant_profile  →  fee_profile
 *
 * Accessible to church_admin (not wgc_admin-gated like the full backfill
 * sync at /api/merchant/settings/sync). This only touches ChurchPricing — it
 * does NOT re-sync payments, refunds, or any transaction records.
 */
export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return toSafeErrorResponse("Unauthorized", err.status);
    throw err;
  }
  // Team-access Checkpoint 4D: was gated on the legacy "church_admin" role
  // string (plus wgc_admin) — migrated to the centralized settings
  // permission (OWNER/authorized ADMIN via canEdit), never available while
  // viewing another user's scope.
  const permissions = getSettingsPermissions(auth.rawRole);
  if (!permissions.canEdit) {
    return toSafeErrorResponse("Unauthorized", 401);
  }
  try {
    await requireFullOrganizationContext(auth);
  } catch (err) {
    if (isAuthError(err)) return toSafeErrorResponse(err.message, err.status);
    throw err;
  }

  const church = await prisma.church.findUnique({
    where: { id: auth.churchId },
    select: { finixMerchantId: true },
  });

  if (!church?.finixMerchantId) {
    return NextResponse.json(
      { error: "This organization has no linked payment processor account yet." },
      { status: 400 }
    );
  }

  try {
    const { syncChurchPricingForChurch } = await import("@/lib/finix/sync/syncFeeProfiles");
    const pricing = await syncChurchPricingForChurch(auth.churchId, church.finixMerchantId);

    if (!pricing) {
      return NextResponse.json(
        { error: "Could not fetch fee profile from Finix. Check that your merchant account is fully provisioned." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      cardPercentageFee: pricing.cardPercentageFee,
      cardFixedFeeCents: pricing.cardFixedFeeCents,
      achFixedFeeCents: pricing.achFixedFeeCents,
      pricingPlanName: pricing.pricingPlanName,
      updatedAt: pricing.updatedAt,
    });
  } catch (err: any) {
    console.error("[sync-pricing] Failed to sync pricing from Finix:", err);
    return toSafeErrorResponse(err, 502);
  }
}
