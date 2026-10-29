import { prisma } from "@/lib/prisma";
import { countedMerchants, periodOf, periodStart } from "./partnerInvoicing";

export interface PartnerBillingSummary {
  /** Null until WGC sets a price: the partner is not being billed yet. */
  pricePerMerchantCents: number | null;
  card: { brand: string | null; last4: string | null; expMonth: number | null; expYear: number | null } | null;
  next: {
    period: string;
    /** The first of that month, when the charge is made. */
    chargeDate: string;
    merchantCount: number;
    amountCents: number | null;
  };
  invoices: {
    id: string;
    period: string;
    merchantCount: number;
    unitPriceCents: number;
    amountCents: number;
    status: string;
    chargedAt: string | null;
    failureReason: string | null;
  }[];
}

/**
 * What the Billing page shows for one partner. `partnerId` must come from the signed-in
 * partner. Never includes card numbers or Finix ids: only the brand, last four and expiry.
 */
export async function loadPartnerBilling(partnerId: string, now: Date = new Date()): Promise<PartnerBillingSummary | null> {
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { pricePerMerchantCents: true, billingPaymentInstrumentId: true, cardBrand: true, cardLast4: true, cardExpMonth: true, cardExpYear: true },
  });
  if (!partner) return null;

  const nextPeriod = periodOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)));
  const [merchants, invoices] = await Promise.all([
    countedMerchants(partnerId, nextPeriod),
    prisma.partnerInvoice.findMany({ where: { partnerId }, orderBy: { period: "desc" }, take: 12 }),
  ]);

  return {
    pricePerMerchantCents: partner.pricePerMerchantCents,
    card: partner.billingPaymentInstrumentId
      ? { brand: partner.cardBrand, last4: partner.cardLast4, expMonth: partner.cardExpMonth, expYear: partner.cardExpYear }
      : null,
    next: {
      period: nextPeriod,
      chargeDate: periodStart(nextPeriod).toISOString(),
      merchantCount: merchants.length,
      amountCents: partner.pricePerMerchantCents ? partner.pricePerMerchantCents * merchants.length : null,
    },
    invoices: invoices.map((i) => ({
      id: i.id,
      period: i.period,
      merchantCount: i.merchantCount,
      unitPriceCents: i.unitPriceCents,
      amountCents: i.amountCents,
      status: i.status,
      chargedAt: i.chargedAt?.toISOString() ?? null,
      failureReason: i.status === "FAILED" || i.status === "AWAITING_CARD" ? i.failureReason : null,
    })),
  };
}
