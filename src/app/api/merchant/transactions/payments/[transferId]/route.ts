import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { reconcilePaymentFees } from "@/lib/payments/backfill";
import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { resolveViewScope } from "@/lib/auth/viewScope";
import { buildPaymentScope } from "@/lib/auth/scopes";
import { isAuthError } from "@/lib/auth/errors";

export async function GET(req: Request, { params }: { params: Promise<{ transferId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return toSafeErrorResponse(err.message, err.status);
    throw err;
  }

  const { transferId } = await params;

  try {
    // Team-access Checkpoint 4A: id + scope combined in one query, not
    // fetch-then-check — a FUNDRAISER guessing another user's transferId
    // gets the same 404 a nonexistent one would.
    const viewScope = await resolveViewScope(auth);
    const scope = buildPaymentScope(auth, viewScope);
    let payment = await prisma.payment.findFirst({
      where: { finixTransferId: transferId, ...scope },
    });

    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    // Attempt backfill if missing calculations
    if (!payment.feeCalculationVersion) {
      const reconciled = await reconcilePaymentFees(payment.id);
      if (reconciled) {
        payment = reconciled;
      }
    }

    return NextResponse.json({
      intendedDonationAmountCents: payment.donationAmountCents,
      totalChargedCents: payment.amountCents,
      supplementalFeeCents: payment.feeCoveredCents ?? 0,
      donorCoversFee: payment.donorCoversFee,
      merchantExpectedNetCents: payment.merchantExpectedNetCents,
      percentageBps: payment.percentageBps,
      fixedFeeCents: payment.fixedFeeCents,
      cardBrand: payment.cardBrand,
      feeCalculationVersion: payment.feeCalculationVersion,
    });
  } catch (error: any) {
    console.error("Failed to load payment detail API:", error);
    return toSafeErrorResponse(error, 500);
  }
}
