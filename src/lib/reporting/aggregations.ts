/**
 * Payment-method-split aggregation, layered on top of the exact eligibility
 * rules donorAggregates.ts already exports (externalDonationEligibilityWhere,
 * finixTransferEligibilityWhere) rather than redefining "what counts as a
 * real donation." One batched query per source, aggregated in Node only
 * after Postgres has already narrowed to the exact candidate donor set —
 * the same pattern loadDonorAggregatesBatch itself uses internally, not a
 * new one.
 *
 * Card/ACH figures ARE net of refunds/returns (each refund/return is tied
 * to a specific FinixTransfer, which is already bucketed by method here,
 * so subtracting it from the right bucket is exact, not a proportional
 * allocation). External sources have no refund concept (a returned/
 * bounced check is simply excluded, same rule donorAggregates uses) —
 * "net" and "gross" are the same number for cash/check/external/in-kind.
 */
import { prisma } from "@/lib/prisma";
import { externalDonationEligibilityWhere, type DateRangeFilter } from "@/lib/donors/donorAggregates";

export interface PaymentMethodBreakdown {
  cardGivingCents: number;
  achGivingCents: number;
  cashGivingCents: number;
  checkGivingCents: number;
  externalOtherGivingCents: number; // Zelle/Cash App/PayPal/bank transfer/terminal/money order
  inKindValueCents: number;
}

export const EMPTY_BREAKDOWN: PaymentMethodBreakdown = {
  cardGivingCents: 0,
  achGivingCents: 0,
  cashGivingCents: 0,
  checkGivingCents: 0,
  externalOtherGivingCents: 0,
  inKindValueCents: 0,
};

// ExternalDonation has no dedicated "in-kind" paymentMethod value (confirmed
// against the schema) — the existing convention for a non-cash-equivalent
// gift is paymentMethod "OTHER" with a donationPurpose/otherPaymentMethodName
// noting the in-kind nature. Centralized here so every reporting surface
// applies the same heuristic rather than each guessing independently.
export function isInKindExternalDonation(row: { paymentMethod: string; otherPaymentMethodName?: string | null; donationPurpose?: string | null }): boolean {
  if (row.paymentMethod !== "OTHER") return false;
  const haystack = `${row.otherPaymentMethodName || ""} ${row.donationPurpose || ""}`.toLowerCase();
  return haystack.includes("in-kind") || haystack.includes("in kind") || haystack.includes("inkind");
}

export async function loadPaymentMethodBreakdownBatch(
  donorIds: string[],
  churchId: string,
  dateFilter?: DateRangeFilter,
  attributedUserId?: string,
): Promise<Map<string, PaymentMethodBreakdown>> {
  const result = new Map<string, PaymentMethodBreakdown>(donorIds.map((id) => [id, { ...EMPTY_BREAKDOWN }]));
  if (donorIds.length === 0) return result;

  const instruments = await prisma.finixPaymentInstrumentSnapshot.findMany({
    where: { churchId, donorId: { in: donorIds } },
    select: { finixPaymentInstrumentId: true, donorId: true, paymentMethodType: true },
  });
  const instrumentMeta = new Map(instruments.map((i) => [i.finixPaymentInstrumentId, i]));
  const instrumentIds = [...instrumentMeta.keys()];

  const transfers = instrumentIds.length
    ? await prisma.finixTransfer.findMany({
        where: {
          churchId,
          finixPaymentInstrumentId: { in: instrumentIds },
          state: "SUCCEEDED",
          ...(dateFilter ? { createdAtFinix: dateFilter } : {}),
        },
        select: { finixTransferId: true, finixPaymentInstrumentId: true, amountCents: true },
      })
    : [];
  const transferIds = transfers.map((t) => t.finixTransferId);

  const [refunds, returns, externalRows] = await Promise.all([
    transferIds.length
      ? prisma.finixRefundOrReversal.findMany({ where: { churchId, finixOriginalTransferId: { in: transferIds }, state: "SUCCEEDED" }, select: { finixOriginalTransferId: true, amountCents: true } })
      : Promise.resolve([]),
    transferIds.length
      ? prisma.bankReturn.findMany({ where: { churchId, originalTransferId: { in: transferIds } }, select: { originalTransferId: true, amountCents: true } })
      : Promise.resolve([]),
    prisma.externalDonation.findMany({
      where: externalDonationEligibilityWhere(churchId, { donorIds, dateFilter, attributedUserId }),
      select: { donorId: true, donationAmountCents: true, paymentMethod: true, otherPaymentMethodName: true, donationPurpose: true, depositStatus: true },
    }),
  ]);
  const refundByTransfer = new Map<string, number>();
  for (const r of refunds) {
    if (!r.finixOriginalTransferId) continue;
    refundByTransfer.set(r.finixOriginalTransferId, (refundByTransfer.get(r.finixOriginalTransferId) ?? 0) + (r.amountCents ?? 0));
  }
  const returnByTransfer = new Map<string, number>();
  for (const r of returns) {
    if (!r.originalTransferId) continue;
    returnByTransfer.set(r.originalTransferId, (returnByTransfer.get(r.originalTransferId) ?? 0) + (r.amountCents ?? 0));
  }

  for (const t of transfers) {
    if (!t.finixPaymentInstrumentId) continue;
    const meta = instrumentMeta.get(t.finixPaymentInstrumentId);
    if (!meta?.donorId) continue;
    const acc = result.get(meta.donorId);
    if (!acc) continue;
    const net = (t.amountCents ?? 0) - (refundByTransfer.get(t.finixTransferId) ?? 0) - (returnByTransfer.get(t.finixTransferId) ?? 0);
    if (meta.paymentMethodType === "BANK_ACCOUNT") acc.achGivingCents += net;
    else acc.cardGivingCents += net;
  }

  for (const r of externalRows) {
    if (!r.donorId || r.depositStatus === "RETURNED") continue;
    const acc = result.get(r.donorId);
    if (!acc) continue;
    if (isInKindExternalDonation(r)) {
      acc.inKindValueCents += r.donationAmountCents;
    } else if (r.paymentMethod === "CASH") {
      acc.cashGivingCents += r.donationAmountCents;
    } else if (r.paymentMethod === "CHECK") {
      acc.checkGivingCents += r.donationAmountCents;
    } else {
      acc.externalOtherGivingCents += r.donationAmountCents;
    }
  }

  return result;
}

/**
 * Smallest successful donation per donor — donorAggregates.ts tracks
 * largest but not smallest (not needed by its existing callers), so this
 * is computed separately here rather than modifying that shared, heavily-
 * relied-on function for one extra Reporting-only column.
 */
export async function loadSmallestDonationBatch(donorIds: string[], churchId: string, dateFilter?: DateRangeFilter): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (donorIds.length === 0) return result;

  const instruments = await prisma.finixPaymentInstrumentSnapshot.findMany({
    where: { churchId, donorId: { in: donorIds } },
    select: { finixPaymentInstrumentId: true, donorId: true },
  });
  const instrumentToDonor = new Map(instruments.map((i) => [i.finixPaymentInstrumentId, i.donorId!]));
  const instrumentIds = [...instrumentToDonor.keys()];

  const [transfers, externalRows] = await Promise.all([
    instrumentIds.length
      ? prisma.finixTransfer.findMany({
          where: { churchId, finixPaymentInstrumentId: { in: instrumentIds }, state: "SUCCEEDED", ...(dateFilter ? { createdAtFinix: dateFilter } : {}) },
          select: { finixPaymentInstrumentId: true, amountCents: true },
        })
      : Promise.resolve([]),
    prisma.externalDonation.findMany({
      where: externalDonationEligibilityWhere(churchId, { donorIds, dateFilter }),
      select: { donorId: true, donationAmountCents: true, depositStatus: true },
    }),
  ]);

  const consider = (donorId: string | undefined, amountCents: number | null | undefined) => {
    if (!donorId || amountCents === null || amountCents === undefined) return;
    const current = result.get(donorId);
    if (current === undefined || amountCents < current) result.set(donorId, amountCents);
  };

  for (const t of transfers) {
    if (!t.finixPaymentInstrumentId) continue;
    consider(instrumentToDonor.get(t.finixPaymentInstrumentId), t.amountCents);
  }
  for (const r of externalRows) {
    if (r.depositStatus === "RETURNED") continue;
    consider(r.donorId ?? undefined, r.donationAmountCents);
  }

  return result;
}
