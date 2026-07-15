import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { reconcilePaymentFees } from "@/lib/payments/backfill";
import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";

export async function GET(req: Request, { params }: { params: Promise<{ transferId: string }> }) {
  const session = await getSession();

  if (!session || session.role !== "church_admin" || !session.churchId) {
    return toSafeErrorResponse("You do not have permission to perform this action.", 401);
  }

  const { transferId } = await params;

  try {
    let payment = await prisma.payment.findFirst({
      where: { finixTransferId: transferId, churchId: session.churchId },
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
