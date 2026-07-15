import { prisma } from "@/lib/prisma";

export interface FundBreakdownRow {
  fundId: string;
  fundName: string;
  donationCount: number;
  grossCents: number;
  refundedCents: number;
  returnedCents: number;
  netCents: number;
}

/**
 * Only queries Payment (the only model with a real fundId relationship
 * populated) — a Finix-native transfer with no matching Payment row has no
 * fund attribution, which is reported as "no fund data" rather than guessed.
 * Returns [] when no real Fund relationships exist for this donor, so the
 * caller can correctly skip rendering the section rather than show a fake
 * "General Fund" bucket.
 */
export async function loadDonorFundBreakdown(donorId: string, churchId: string): Promise<FundBreakdownRow[]> {
  const payments = await prisma.payment.findMany({
    where: { churchId, donorId, fundId: { not: null }, status: "SUCCEEDED" },
    select: { fundId: true, amountCents: true, finixTransferId: true },
  });
  if (payments.length === 0) return [];

  const transferIds = payments.map((p) => p.finixTransferId).filter((id): id is string => Boolean(id));
  const [refunds, returns] = await Promise.all([
    transferIds.length
      ? prisma.finixRefundOrReversal.findMany({ where: { churchId, finixOriginalTransferId: { in: transferIds }, state: "SUCCEEDED" }, select: { finixOriginalTransferId: true, amountCents: true } })
      : Promise.resolve([]),
    transferIds.length
      ? prisma.bankReturn.findMany({ where: { churchId, originalTransferId: { in: transferIds } }, select: { originalTransferId: true, amountCents: true } })
      : Promise.resolve([]),
  ]);
  const refundByTransfer = new Map(refunds.map((r) => [r.finixOriginalTransferId, r.amountCents ?? 0]));
  const returnByTransfer = new Map(returns.map((r) => [r.originalTransferId, r.amountCents ?? 0]));

  const byFund = new Map<string, { count: number; gross: number; refunded: number; returned: number }>();
  for (const p of payments) {
    const acc = byFund.get(p.fundId!) ?? { count: 0, gross: 0, refunded: 0, returned: 0 };
    acc.count += 1;
    acc.gross += p.amountCents;
    if (p.finixTransferId) {
      acc.refunded += refundByTransfer.get(p.finixTransferId) ?? 0;
      acc.returned += returnByTransfer.get(p.finixTransferId) ?? 0;
    }
    byFund.set(p.fundId!, acc);
  }

  const funds = await prisma.fund.findMany({ where: { id: { in: [...byFund.keys()] }, churchId } });
  return funds.map((f) => {
    const acc = byFund.get(f.id)!;
    return {
      fundId: f.id,
      fundName: f.name,
      donationCount: acc.count,
      grossCents: acc.gross,
      refundedCents: acc.refunded,
      returnedCents: acc.returned,
      netCents: acc.gross - acc.refunded - acc.returned,
    };
  });
}

export type PaymentMethodKind = "CARD" | "BANK" | "APPLE_PAY" | "GOOGLE_PAY" | "OTHER";

export interface PaymentMethodMixRow {
  method: PaymentMethodKind;
  amountCents: number;
  count: number;
}

function classifyInstrument(instrument: { instrumentType: string | null; paymentMethodType: string | null; cardBrand: string | null; bankLast4: string | null }): PaymentMethodKind {
  const type = (instrument.instrumentType || instrument.paymentMethodType || "").toUpperCase();
  if (type.includes("APPLE")) return "APPLE_PAY";
  if (type.includes("GOOGLE")) return "GOOGLE_PAY";
  if (instrument.bankLast4 || type.includes("BANK") || type.includes("ACH")) return "BANK";
  if (instrument.cardBrand || type.includes("CARD") || type.includes("PAYMENT_CARD")) return "CARD";
  return "OTHER";
}

/** Grouped by the instrument's own real type — an unrecognized type is OTHER, never assumed to be a card. */
export async function loadDonorPaymentMethodMix(instrumentIds: string[], churchId: string): Promise<PaymentMethodMixRow[]> {
  if (instrumentIds.length === 0) return [];

  const instruments = await prisma.finixPaymentInstrumentSnapshot.findMany({
    where: { churchId, finixPaymentInstrumentId: { in: instrumentIds } },
    select: { finixPaymentInstrumentId: true, instrumentType: true, paymentMethodType: true, cardBrand: true, bankLast4: true },
  });
  const kindByInstrument = new Map(instruments.map((i) => [i.finixPaymentInstrumentId, classifyInstrument(i)]));

  const transfers = await prisma.finixTransfer.findMany({
    where: { churchId, finixPaymentInstrumentId: { in: instrumentIds }, state: "SUCCEEDED" },
    select: { finixPaymentInstrumentId: true, amountCents: true },
  });

  const totals = new Map<PaymentMethodKind, { amount: number; count: number }>();
  for (const t of transfers) {
    const kind = t.finixPaymentInstrumentId ? kindByInstrument.get(t.finixPaymentInstrumentId) ?? "OTHER" : "OTHER";
    const acc = totals.get(kind) ?? { amount: 0, count: 0 };
    acc.amount += t.amountCents ?? 0;
    acc.count += 1;
    totals.set(kind, acc);
  }

  return [...totals.entries()].map(([method, v]) => ({ method, amountCents: v.amount, count: v.count }));
}
