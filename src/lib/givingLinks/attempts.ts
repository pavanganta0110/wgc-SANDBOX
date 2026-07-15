import { prisma } from "@/lib/prisma";

/**
 * Every donation made through a Giving Link is a normal Payment row tagged
 * with givingLinkId — this loads the same joins (transfer/instrument/donor)
 * used across Payments/Refunds so the Donation Attempts table and the
 * shared PaymentDetailPanel drawer show consistent data.
 */
export async function loadGivingLinkAttempts(
  churchId: string,
  opts: { givingLinkId?: string; dateFilter?: { gte: Date; lte?: Date }; take?: number } = {}
) {
  const payments = await prisma.payment.findMany({
    where: {
      churchId,
      givingLinkId: opts.givingLinkId ? opts.givingLinkId : { not: null },
      ...(opts.dateFilter ? { createdAt: opts.dateFilter } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 200,
  });

  const givingLinkIds = [...new Set(payments.map((p) => p.givingLinkId).filter((id): id is string => Boolean(id)))];
  const givingLinks = givingLinkIds.length
    ? await prisma.givingLink.findMany({ where: { id: { in: givingLinkIds } } })
    : [];
  const givingLinkMap = new Map(givingLinks.map((l) => [l.id, l]));

  const transferIds = payments.map((p) => p.finixTransferId).filter((id): id is string => Boolean(id));
  const transfers = transferIds.length
    ? await prisma.finixTransfer.findMany({ where: { finixTransferId: { in: transferIds } } })
    : [];
  const transferMap = new Map(transfers.map((t) => [t.finixTransferId, t]));

  const instrumentIds = payments
    .map((p) => p.finixPaymentInstrumentId)
    .filter((id): id is string => Boolean(id));
  const instruments = instrumentIds.length
    ? await prisma.finixPaymentInstrumentSnapshot.findMany({ where: { finixPaymentInstrumentId: { in: instrumentIds } } })
    : [];
  const instrumentMap = new Map(instruments.map((i) => [i.finixPaymentInstrumentId, i]));

  const donorIds = payments.map((p) => p.donorId).filter((id): id is string => Boolean(id));
  const donors = donorIds.length ? await prisma.donor.findMany({ where: { id: { in: donorIds } } }) : [];
  const donorMap = new Map(donors.map((d) => [d.id, d]));

  return payments.map((p) => ({
    payment: p,
    givingLink: p.givingLinkId ? givingLinkMap.get(p.givingLinkId) ?? null : null,
    transfer: p.finixTransferId ? transferMap.get(p.finixTransferId) ?? null : null,
    instrument: p.finixPaymentInstrumentId ? instrumentMap.get(p.finixPaymentInstrumentId) ?? null : null,
    donor: p.donorId ? donorMap.get(p.donorId) ?? null : null,
  }));
}

export function describeInstrumentType(paymentMethodType: string | null | undefined): string {
  const t = (paymentMethodType || "").toUpperCase();
  if (t === "PAYMENT_CARD") return "Card";
  if (t === "BANK_ACCOUNT") return "Bank Account";
  if (t === "APPLE_PAY") return "Apple Pay";
  if (t === "GOOGLE_PAY") return "Google Pay";
  return "Unknown";
}
