import { FinixTransfer, FinixRefundOrReversal, BankReturn } from "@prisma/client";

export interface RefundEligibility {
  eligible: boolean;
  reason?: string;
}

export function checkRefundEligibility(
  transfer: FinixTransfer,
  refunds: FinixRefundOrReversal[],
  bankReturns: BankReturn[],
  churchId: string
): RefundEligibility {
  // 1. Organization owns the payment
  if (transfer.churchId !== churchId) {
    return { eligible: false, reason: "This record could not be found." };
  }

  // 2. Resource is a real completed payment/transfer
  if (transfer.type !== "TRANSFER") {
    return { eligible: false, reason: "This transaction is not eligible for a refund." };
  }

  // 3. State is eligible (SUCCEEDED)
  const state = (transfer.state || "").toUpperCase();
  if (state !== "SUCCEEDED") {
    if (state === "FAILED" || state === "CANCELED") {
      return { eligible: false, reason: "Failed payments cannot be refunded." };
    }
    return { eligible: false, reason: "This payment is still processing and cannot be refunded yet." };
  }

  // 4. Payment has not been returned (Bank payment returned)
  if (bankReturns.length > 0) {
    return { eligible: false, reason: "This bank payment was returned and is no longer refundable." };
  }

  // 5. Calculate remaining refundable balance
  const totalRefundedCents = refunds
    .filter((r) => r.state === "SUCCEEDED" || r.state === "PENDING")
    .reduce((sum, r) => sum + (r.amountCents ?? 0), 0);
  
  const remainingCents = (transfer.amountCents ?? 0) - totalRefundedCents;

  // 6. Check if payment is not fully refunded or balance is zero
  if (remainingCents <= 0) {
    return { eligible: false, reason: "This payment has already been fully refunded." };
  }

  return { eligible: true };
}
