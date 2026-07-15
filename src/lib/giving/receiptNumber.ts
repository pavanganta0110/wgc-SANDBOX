/**
 * Deterministic, donor-facing receipt number — not a database sequence, so
 * no cross-request counter coordination is needed and it's stable if a
 * receipt is regenerated/resent. Distinct from finixTransferId (an internal
 * processor reference never meant for donor-facing display).
 */
export function generateReceiptNumber(prefix: string | null | undefined, paymentId: string, createdAt: Date): string {
  const year = createdAt.getFullYear();
  const suffix = paymentId.replace(/[^a-zA-Z0-9]/g, "").slice(-8).toUpperCase();
  return `${prefix || "RCPT"}-${year}-${suffix}`;
}
