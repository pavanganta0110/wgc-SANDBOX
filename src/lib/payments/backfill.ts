import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";
import { normalizeCardBrand, WGC_PRICING } from "@/lib/giving/feeCalculator";

export async function reconcilePaymentFees(paymentId: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return null;

  if (payment.feeCalculationVersion) {
    return payment;
  }

  if (!payment.finixTransferId) {
    return payment;
  }

  try {
    const transfer = await finixClient.getTransfer(payment.finixTransferId);
    if (!transfer?.id) return payment;

    const supplementalFeeCents = transfer.supplemental_fee || 0;
    const totalChargedCents = transfer.amount || payment.amountCents;
    const brand = normalizeCardBrand(transfer.card?.brand);

    // Solve donorCoversFee safely:
    // If total charge is greater than the base donation amount, the donor covers it.
    // If total charge is exactly equal to the base donation amount, the organization covers it.
    const intendedCents = payment.donationAmountCents ?? totalChargedCents;
    let donorCoversFee: boolean | null = null;
    if (payment.donationAmountCents !== null) {
      if (totalChargedCents > payment.donationAmountCents) {
        donorCoversFee = true;
      } else if (totalChargedCents === payment.donationAmountCents) {
        donorCoversFee = false;
      }
    }

    const isAmex = brand === "AMERICAN_EXPRESS";
    const pricing = donorCoversFee ? WGC_PRICING.donorCovered : WGC_PRICING.organizationPaid;
    const percentageBps = isAmex ? pricing.amexCardBasisPoints : pricing.nonAmexCardBasisPoints;
    const fixedFeeCents = donorCoversFee ? 0 : WGC_PRICING.organizationPaid.cardFixedFeeCents;

    let merchantExpectedNetCents = intendedCents;
    if (donorCoversFee === false) {
      merchantExpectedNetCents = intendedCents - supplementalFeeCents;
    } else if (donorCoversFee === null) {
      merchantExpectedNetCents = totalChargedCents - supplementalFeeCents;
    }

    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        donorCoversFee,
        cardBrand: brand,
        percentageBps,
        fixedFeeCents,
        feeCalculationVersion: "historical_backfilled",
        merchantExpectedNetCents,
        feeCoveredCents: supplementalFeeCents,
      },
    });

    return updated;
  } catch (err) {
    console.error(`Failed to backfill payment fees for payment ${paymentId}:`, err);
    return payment;
  }
}
