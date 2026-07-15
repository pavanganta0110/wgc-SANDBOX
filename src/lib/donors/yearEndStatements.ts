import { prisma } from "@/lib/prisma";
import { isValidEmail } from "@/lib/donors/donorContact";
import { computeRecordedContributionAmountCents } from "@/lib/giving/goodsServices";

/** A statement can't be generated/sent with confidence until the donor has a valid email and a resolvable display name (anonymous donors are exempt from the name check by design). */
export function hasMissingStatementInfo(donor: { email: string | null; name: string | null }, displayName: string, isAnonymous: boolean): boolean {
  return !donor.email || !isValidEmail(donor.email) || (displayName === "—" && !isAnonymous);
}

/**
 * WGC does not calculate taxes and does not provide tax advice. This
 * service only summarizes donations recorded during a calendar year for a
 * donor's own record-keeping — nothing here computes a deduction, taxable
 * income, or filing value.
 */
export interface StatementLine {
  paymentId: string | null;
  transferId: string;
  donationDate: Date;
  reference: string;
  fundName: string | null;
  grossAmountCents: number;
  donorCoveredFeeCents: number;
  refundedAmountCents: number;
  returnedAmountCents: number;
  finalRecordedAmountCents: number;
  paymentMethodLabel: string;
  goodsServicesProvided: boolean;
  goodsServicesDescription: string | null;
  goodsServicesFairMarketValueCents: number | null;
  recordedContributionAmountCents: number;
}

export interface StatementCalculation {
  taxYear: number;
  donationCount: number;
  grossDonatedCents: number;
  refundedAmountCents: number;
  returnedAmountCents: number;
  recordedTotalCents: number;
  totalGoodsServicesValueCents: number;
  totalRecordedContributionAmountCents: number;
  lines: StatementLine[];
}

function yearBoundsCentral(taxYear: number): { gte: Date; lte: Date } {
  // America/Chicago is UTC-6 (CST) / UTC-5 (CDT). Using a fixed -6 offset
  // for year boundaries is a deliberate simplification — the few hours of
  // ambiguity at the DST edges around Jan 1 are immaterial for an annual
  // summary (unlike day-level bucketing elsewhere in this app, which uses
  // the real DST-aware startOfDayCentral/endOfDayCentral helpers).
  const gte = new Date(Date.UTC(taxYear, 0, 1, 6, 0, 0));
  const lte = new Date(Date.UTC(taxYear + 1, 0, 1, 5, 59, 59, 999));
  return { gte, lte };
}

/**
 * Computes the year-end donation summary for one donor. Eligibility:
 * completed successful donations only — excludes failed/canceled/pending/
 * voided/fully-refunded/fully-returned records. A partial refund or ACH
 * return reduces the recorded amount for that line but does not remove it
 * from the statement. Open disputes are never subtracted; only a
 * confirmed, recorded reversal (a real refund/return record) reduces the
 * total — there is no separate "lost dispute" adjustment path since this
 * app already represents a confirmed dispute loss as a real reversal.
 */
export async function computeYearEndStatement(donorId: string, churchId: string, taxYear: number): Promise<StatementCalculation> {
  const { gte, lte } = yearBoundsCentral(taxYear);

  const instruments = await prisma.finixPaymentInstrumentSnapshot.findMany({
    where: { churchId, donorId },
    select: { finixPaymentInstrumentId: true, cardBrand: true, cardLast4: true, bankLast4: true },
  });
  const instrumentIds = instruments.map((i) => i.finixPaymentInstrumentId);
  const instrumentById = new Map(instruments.map((i) => [i.finixPaymentInstrumentId, i]));
  if (instrumentIds.length === 0) {
    return {
      taxYear,
      donationCount: 0,
      grossDonatedCents: 0,
      refundedAmountCents: 0,
      returnedAmountCents: 0,
      recordedTotalCents: 0,
      totalGoodsServicesValueCents: 0,
      totalRecordedContributionAmountCents: 0,
      lines: [],
    };
  }

  const transfers = await prisma.finixTransfer.findMany({
    where: { churchId, finixPaymentInstrumentId: { in: instrumentIds }, state: "SUCCEEDED", createdAtFinix: { gte, lte } },
    orderBy: { createdAtFinix: "asc" },
  });
  const transferIds = transfers.map((t) => t.finixTransferId);

  const [refunds, returns, payments] = await Promise.all([
    transferIds.length
      ? prisma.finixRefundOrReversal.findMany({ where: { churchId, finixOriginalTransferId: { in: transferIds }, state: "SUCCEEDED" }, select: { finixOriginalTransferId: true, amountCents: true } })
      : Promise.resolve([]),
    transferIds.length
      ? prisma.bankReturn.findMany({ where: { churchId, originalTransferId: { in: transferIds } }, select: { originalTransferId: true, amountCents: true } })
      : Promise.resolve([]),
    transferIds.length
      ? prisma.payment.findMany({
          where: { churchId, finixTransferId: { in: transferIds } },
          select: {
            id: true,
            finixTransferId: true,
            fundId: true,
            feeCoveredCents: true,
            goodsServicesProvided: true,
            goodsServicesDescription: true,
            goodsServicesFairMarketValueCents: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const refundByTransfer = new Map<string, number>();
  for (const r of refunds) refundByTransfer.set(r.finixOriginalTransferId!, (refundByTransfer.get(r.finixOriginalTransferId!) ?? 0) + (r.amountCents ?? 0));
  const returnByTransfer = new Map<string, number>();
  for (const r of returns) returnByTransfer.set(r.originalTransferId!, (returnByTransfer.get(r.originalTransferId!) ?? 0) + (r.amountCents ?? 0));
  const paymentByTransfer = new Map(payments.map((p) => [p.finixTransferId!, p]));

  const fundIds = payments.map((p) => p.fundId).filter((id): id is string => Boolean(id));
  const funds = fundIds.length ? await prisma.fund.findMany({ where: { id: { in: fundIds }, churchId } }) : [];
  const fundById = new Map(funds.map((f) => [f.id, f.name]));

  const lines: StatementLine[] = [];
  let grossDonatedCents = 0;
  let refundedAmountCents = 0;
  let returnedAmountCents = 0;
  let totalGoodsServicesValueCents = 0;
  let totalRecordedContributionAmountCents = 0;

  for (const t of transfers) {
    const gross = t.amountCents ?? 0;
    const refunded = refundByTransfer.get(t.finixTransferId) ?? 0;
    const returned = returnByTransfer.get(t.finixTransferId) ?? 0;
    const final = gross - refunded - returned;

    // Fully refunded or fully returned — excluded from the statement
    // entirely, not shown as a zero-amount line.
    if (final <= 0) continue;

    const instrument = t.finixPaymentInstrumentId ? instrumentById.get(t.finixPaymentInstrumentId) : undefined;
    const payment = paymentByTransfer.get(t.finixTransferId);

    const goodsServicesProvided = payment?.goodsServicesProvided ?? false;
    const fairMarketValueCents = goodsServicesProvided ? payment?.goodsServicesFairMarketValueCents ?? 0 : 0;
    const recordedContributionAmountCents = goodsServicesProvided ? computeRecordedContributionAmountCents(final, fairMarketValueCents) : final;

    lines.push({
      paymentId: payment?.id ?? null,
      transferId: t.finixTransferId,
      donationDate: t.createdAtFinix!,
      reference: t.finixTransferId,
      fundName: payment?.fundId ? fundById.get(payment.fundId) ?? null : null,
      grossAmountCents: gross,
      donorCoveredFeeCents: payment?.feeCoveredCents ?? 0,
      refundedAmountCents: refunded,
      returnedAmountCents: returned,
      finalRecordedAmountCents: final,
      paymentMethodLabel: instrument?.cardBrand
        ? `${instrument.cardBrand} •••• ${instrument.cardLast4 ?? ""}`
        : instrument?.bankLast4
          ? `Bank •••• ${instrument.bankLast4}`
          : "—",
      goodsServicesProvided,
      goodsServicesDescription: goodsServicesProvided ? payment?.goodsServicesDescription ?? null : null,
      goodsServicesFairMarketValueCents: goodsServicesProvided ? payment?.goodsServicesFairMarketValueCents ?? null : null,
      recordedContributionAmountCents,
    });

    grossDonatedCents += gross;
    refundedAmountCents += refunded;
    returnedAmountCents += returned;
    totalGoodsServicesValueCents += fairMarketValueCents;
    totalRecordedContributionAmountCents += recordedContributionAmountCents;
  }

  return {
    taxYear,
    donationCount: lines.length,
    totalGoodsServicesValueCents,
    totalRecordedContributionAmountCents,
    grossDonatedCents,
    refundedAmountCents,
    returnedAmountCents,
    recordedTotalCents: grossDonatedCents - refundedAmountCents - returnedAmountCents,
    lines,
  };
}

/** All donors in the organization with at least one qualifying donation in the given year. */
export async function findEligibleDonorsForYear(churchId: string, taxYear: number): Promise<{ donorId: string; donationCount: number; recordedTotalCents: number }[]> {
  const { gte, lte } = yearBoundsCentral(taxYear);

  const instruments = await prisma.finixPaymentInstrumentSnapshot.findMany({
    where: { churchId, donorId: { not: null } },
    select: { finixPaymentInstrumentId: true, donorId: true },
  });
  const instrumentToDonor = new Map(instruments.map((i) => [i.finixPaymentInstrumentId, i.donorId!]));
  const instrumentIds = [...instrumentToDonor.keys()];
  if (instrumentIds.length === 0) return [];

  const transfers = await prisma.finixTransfer.findMany({
    where: { churchId, finixPaymentInstrumentId: { in: instrumentIds }, state: "SUCCEEDED", createdAtFinix: { gte, lte } },
    select: { finixTransferId: true, finixPaymentInstrumentId: true, amountCents: true },
  });
  const transferIds = transfers.map((t) => t.finixTransferId);

  const [refunds, returns] = await Promise.all([
    transferIds.length ? prisma.finixRefundOrReversal.findMany({ where: { churchId, finixOriginalTransferId: { in: transferIds }, state: "SUCCEEDED" }, select: { finixOriginalTransferId: true, amountCents: true } }) : Promise.resolve([]),
    transferIds.length ? prisma.bankReturn.findMany({ where: { churchId, originalTransferId: { in: transferIds } }, select: { originalTransferId: true, amountCents: true } }) : Promise.resolve([]),
  ]);
  const refundByTransfer = new Map<string, number>();
  for (const r of refunds) refundByTransfer.set(r.finixOriginalTransferId!, (refundByTransfer.get(r.finixOriginalTransferId!) ?? 0) + (r.amountCents ?? 0));
  const returnByTransfer = new Map<string, number>();
  for (const r of returns) returnByTransfer.set(r.originalTransferId!, (returnByTransfer.get(r.originalTransferId!) ?? 0) + (r.amountCents ?? 0));

  const byDonor = new Map<string, { count: number; total: number }>();
  for (const t of transfers) {
    const donorId = t.finixPaymentInstrumentId ? instrumentToDonor.get(t.finixPaymentInstrumentId) : undefined;
    if (!donorId) continue;
    const final = (t.amountCents ?? 0) - (refundByTransfer.get(t.finixTransferId) ?? 0) - (returnByTransfer.get(t.finixTransferId) ?? 0);
    if (final <= 0) continue;
    const acc = byDonor.get(donorId) ?? { count: 0, total: 0 };
    acc.count += 1;
    acc.total += final;
    byDonor.set(donorId, acc);
  }

  return [...byDonor.entries()].map(([donorId, v]) => ({ donorId, donationCount: v.count, recordedTotalCents: v.total }));
}
