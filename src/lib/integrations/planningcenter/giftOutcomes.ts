import { prisma } from "@/lib/prisma";
import { computeRefundStatus } from "@/lib/finix/refundStatus";

/**
 * A gift's REAL state, worked out the way the rest of WGC does it.
 *
 * `Payment.status` is not enough: refunding a donation does NOT change it (it stays SUCCEEDED). A refund is
 * recorded as FinixRefundOrReversal rows, a bank return as BankReturn rows, and the year-end statement counts
 * "charged minus refunds minus returns". Anything that decides "was this gift refunded or returned?" must go
 * through here, or a fully refunded gift would be sent to Planning Center as if it were a normal one.
 */

export type EffectiveStatus =
  | "SUCCEEDED"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED"
  | "REFUND_PENDING"
  | "RETURNED"
  | "FAILED"
  | "CANCELED"
  | "PENDING"
  | string;

export interface PaymentForOutcome {
  id: string;
  status: string;
  amountCents: number;
  finixTransferId: string | null;
}

/** Pure: the effective status from the payment and the refund/return rows for its transfer. */
export function effectiveStatus(
  payment: Pick<PaymentForOutcome, "status" | "amountCents">,
  refunds: Array<{ amountCents: number | null; state: string | null }>,
  returnedCents: number
): EffectiveStatus {
  // A bank return or a failure is already reflected on the payment itself.
  if (["RETURNED", "FAILED", "CANCELED"].includes(payment.status)) return payment.status;
  if (payment.status !== "SUCCEEDED" && payment.status !== "PARTIALLY_REFUNDED" && payment.status !== "REFUNDED") return payment.status;

  if (returnedCents > 0 && returnedCents >= payment.amountCents) return "RETURNED";

  const refund = computeRefundStatus({ amountCents: payment.amountCents }, refunds);
  if (refund.refundStatus === "FULL") return "REFUNDED";
  if (refund.refundStatus === "PENDING") return "REFUND_PENDING";
  if (refund.refundStatus === "PARTIAL" || returnedCents > 0) return "PARTIALLY_REFUNDED";
  // The stored status can say REFUNDED/PARTIALLY_REFUNDED on older rows even with no refund rows; trust it then.
  return payment.status === "SUCCEEDED" ? "SUCCEEDED" : payment.status;
}

/** Looks up refunds and bank returns for these payments (this church only) and returns each one's effective status. */
export async function effectivePaymentStatuses(churchId: string, payments: PaymentForOutcome[]): Promise<Map<string, EffectiveStatus>> {
  const transferIds = payments.map((p) => p.finixTransferId).filter((id): id is string => Boolean(id));
  const [refundRows, returnRows] = transferIds.length
    ? await Promise.all([
        prisma.finixRefundOrReversal.findMany({ where: { churchId, finixOriginalTransferId: { in: transferIds } }, select: { finixOriginalTransferId: true, amountCents: true, state: true } }),
        prisma.bankReturn.findMany({ where: { churchId, originalTransferId: { in: transferIds } }, select: { originalTransferId: true, amountCents: true } }),
      ])
    : [[], []];

  const refundsByTransfer = new Map<string, Array<{ amountCents: number | null; state: string | null }>>();
  for (const r of refundRows) {
    if (!r.finixOriginalTransferId) continue;
    refundsByTransfer.set(r.finixOriginalTransferId, [...(refundsByTransfer.get(r.finixOriginalTransferId) ?? []), r]);
  }
  const returnedByTransfer = new Map<string, number>();
  for (const r of returnRows) {
    if (!r.originalTransferId) continue;
    returnedByTransfer.set(r.originalTransferId, (returnedByTransfer.get(r.originalTransferId) ?? 0) + (r.amountCents ?? 0));
  }

  return new Map(
    payments.map((p) => [
      p.id,
      effectiveStatus(p, p.finixTransferId ? refundsByTransfer.get(p.finixTransferId) ?? [] : [], p.finixTransferId ? returnedByTransfer.get(p.finixTransferId) ?? 0 : 0),
    ])
  );
}
