import { prisma } from "@/lib/prisma";
import { emitEvent } from "@/lib/events/emitEvent";

/**
 * Emits recurring.payment_failed / recurring.payment_recovered for a
 * subscription-driven Payment once its terminal status is known — called
 * from both places a recurring charge's Payment row can reach that state
 * (created already-terminal, or flipped async via the Finix webhook's
 * transfer-state-sync block). "Recovered" specifically means: this
 * subscription has at least one earlier FAILED payment before this
 * successful one — a normal first successful charge is not a "recovery."
 * Never throws — callers should still wrap this in their own try/catch as
 * defensive belt-and-suspenders, matching every other emitEvent() call
 * site in this codebase.
 */
export async function emitRecurringPaymentOutcomeEvent(payment: {
  id: string;
  churchId: string;
  donorId: string | null;
  finixSubscriptionId: string | null;
  status: string;
  createdAt: Date;
}): Promise<void> {
  if (!payment.finixSubscriptionId) return;

  if (payment.status === "FAILED") {
    await emitEvent({
      type: "recurring.payment_failed",
      churchId: payment.churchId,
      data: { paymentId: payment.id, donorId: payment.donorId, finixSubscriptionId: payment.finixSubscriptionId },
    });
    return;
  }

  if (payment.status === "SUCCEEDED") {
    const priorFailure = await prisma.payment.findFirst({
      where: { finixSubscriptionId: payment.finixSubscriptionId, status: "FAILED", createdAt: { lt: payment.createdAt } },
      select: { id: true },
    });
    if (priorFailure) {
      await emitEvent({
        type: "recurring.payment_recovered",
        churchId: payment.churchId,
        data: { paymentId: payment.id, donorId: payment.donorId, finixSubscriptionId: payment.finixSubscriptionId },
      });
    }
  }
}
