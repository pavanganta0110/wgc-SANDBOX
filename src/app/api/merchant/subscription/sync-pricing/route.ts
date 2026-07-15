import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";

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
  const session = await getSession();

  if (!session || !session.churchId || !["church_admin", "wgc_admin"].includes(session.role ?? "")) {
    return toSafeErrorResponse("Unauthorized", 401);
  }

  const church = await prisma.church.findUnique({
    where: { id: session.churchId },
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
    const pricing = await syncChurchPricingForChurch(session.churchId, church.finixMerchantId);

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
