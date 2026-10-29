import { prisma } from "@/lib/prisma";
import {
  buildExternalLedgerRow,
  buildPaymentLedgerRow,
  type LedgerDonorSource,
  type LedgerExternalSource,
  type LedgerLookups,
  type LedgerPaymentSource,
  type LedgerRow,
} from "./ledgerRow";

/** Hard cap on one ledger read. A window over the cap is rejected, not silently cut. */
export const LEDGER_MAX_ROWS = 10_000;

// A gift is in the ledger once money moved: SUCCEEDED, or RETURNED (an ACH the
// bank sent back — still a ledger row, flagged, so a statement can exclude it).
const LEDGER_PAYMENT_STATUSES = ["SUCCEEDED", "RETURNED"];

// Refund rows in these states never moved money back, so they don't count.
const NON_COUNTING_REFUND_STATES = new Set(["FAILED", "CANCELED", "CANCELLED"]);

const IN_CLAUSE_CHUNK = 5000;

const PAYMENT_SELECT = {
  id: true,
  donorId: true,
  createdAt: true,
  status: true,
  paymentMethodType: true,
  cardBrand: true,
  amountCents: true,
  donationAmountCents: true,
  feeCoveredCents: true,
  donorCoversFee: true,
  actualFinixFeesCents: true,
  merchantExpectedNetCents: true,
  fundId: true,
  fundName: true,
  finixSubscriptionId: true,
  finixTransferId: true,
  goodsServicesProvided: true,
  goodsServicesDescription: true,
  goodsServicesFairMarketValueCents: true,
  givingLinkId: true,
  receiptNumber: true,
} as const;

const EXTERNAL_SELECT = {
  id: true,
  donorId: true,
  donationDate: true,
  paymentMethod: true,
  status: true,
  donationAmountCents: true,
  supplementalFeeCents: true,
  processingFeeCents: true,
  providerFeeCents: true,
  netAmountReceivedCents: true,
  fundId: true,
  fundName: true,
  goodsOrServicesProvided: true,
  goodsOrServicesDescription: true,
  goodsOrServicesValueCents: true,
  finixSettlementId: true,
  voidedAt: true,
  receiptNumber: true,
} as const;

const DONOR_SELECT = {
  id: true,
  name: true,
  salutation: true,
  email: true,
  phone: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  state: true,
  postalCode: true,
  country: true,
} as const;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Everything a set of gifts needs beyond its own row, in a fixed number of queries (never one per gift). */
async function loadLookups(churchId: string, payments: LedgerPaymentSource[], externals: LedgerExternalSource[]): Promise<LedgerLookups> {
  const donorIds = [...new Set([...payments.map((p) => p.donorId), ...externals.map((e) => e.donorId)].filter((id): id is string => !!id))];
  const paymentIds = payments.map((p) => p.id);
  const transferIds = [...new Set(payments.map((p) => p.finixTransferId).filter((id): id is string => !!id))];

  const [donorRows, refundRows, disputeRows, transferRows] = await Promise.all([
    Promise.all(chunk(donorIds, IN_CLAUSE_CHUNK).map((ids) => prisma.donor.findMany({ where: { churchId, id: { in: ids } }, select: DONOR_SELECT }))).then((r) => r.flat()),
    Promise.all(
      chunk(paymentIds, IN_CLAUSE_CHUNK).map((ids) =>
        prisma.finixRefundOrReversal.findMany({ where: { churchId, originalPaymentId: { in: ids } }, select: { originalPaymentId: true, amountCents: true, state: true } })
      )
    ).then((r) => r.flat()),
    Promise.all(
      chunk(paymentIds, IN_CLAUSE_CHUNK).map((ids) => prisma.finixDispute.findMany({ where: { churchId, paymentId: { in: ids } }, select: { paymentId: true, state: true } }))
    ).then((r) => r.flat()),
    Promise.all(
      chunk(transferIds, IN_CLAUSE_CHUNK).map((ids) =>
        prisma.finixTransfer.findMany({ where: { churchId, finixTransferId: { in: ids } }, select: { finixTransferId: true, finixSettlementId: true, feeCents: true } })
      )
    ).then((r) => r.flat()),
  ]);

  const donors = new Map<string, LedgerDonorSource>(donorRows.map((d) => [d.id, d]));

  const refundedCentsByPaymentId = new Map<string, number>();
  for (const refund of refundRows) {
    if (!refund.originalPaymentId) continue;
    if (refund.state && NON_COUNTING_REFUND_STATES.has(refund.state.toUpperCase())) continue;
    refundedCentsByPaymentId.set(refund.originalPaymentId, (refundedCentsByPaymentId.get(refund.originalPaymentId) ?? 0) + (refund.amountCents ?? 0));
  }

  const disputeStateByPaymentId = new Map<string, string | null>();
  for (const dispute of disputeRows) {
    if (dispute.paymentId && !disputeStateByPaymentId.has(dispute.paymentId)) disputeStateByPaymentId.set(dispute.paymentId, dispute.state);
  }

  const transfersByFinixTransferId = new Map<string, { settlementId: string | null; feeCents: number | null }>(
    transferRows.map((t) => [t.finixTransferId, { settlementId: t.finixSettlementId, feeCents: t.feeCents }])
  );

  return { donors, refundedCentsByPaymentId, disputeStateByPaymentId, transfersByFinixTransferId };
}

export interface LoadLedgerParams {
  /** Always the authenticated church — never a caller-supplied id. */
  churchId: string;
  /** Inclusive. */
  from: Date;
  /** Exclusive. */
  to: Date;
  maxRows?: number;
}

export interface LoadLedgerResult {
  rows: LedgerRow[];
  /** True when the window holds more than maxRows gifts; rows is then cut at maxRows. */
  truncated: boolean;
}

/** Every gift (WGC and external) in [from, to), oldest first, in one call. */
export async function loadLedgerRows(params: LoadLedgerParams): Promise<LoadLedgerResult> {
  const { churchId, from, to } = params;
  const maxRows = params.maxRows ?? LEDGER_MAX_ROWS;

  const [payments, externals] = await Promise.all([
    prisma.payment.findMany({
      where: { churchId, status: { in: LEDGER_PAYMENT_STATUSES }, createdAt: { gte: from, lt: to } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: maxRows + 1,
      select: PAYMENT_SELECT,
    }),
    prisma.externalDonation.findMany({
      where: { churchId, donationDate: { gte: from, lt: to } },
      orderBy: [{ donationDate: "asc" }, { id: "asc" }],
      take: maxRows + 1,
      select: EXTERNAL_SELECT,
    }),
  ]);

  const lookups = await loadLookups(churchId, payments, externals);
  const rows = [...payments.map((p) => buildPaymentLedgerRow(p, lookups)), ...externals.map((e) => buildExternalLedgerRow(e, lookups))].sort(
    (a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date))
  );

  const truncated = rows.length > maxRows;
  return { rows: truncated ? rows.slice(0, maxRows) : rows, truncated };
}

/** The ledger row for one WGC payment, for the donation.created payload. Null if it isn't this church's. */
export async function loadLedgerRowForPayment(churchId: string, paymentId: string): Promise<LedgerRow | null> {
  const payment = await prisma.payment.findFirst({ where: { id: paymentId, churchId }, select: PAYMENT_SELECT });
  if (!payment) return null;
  const lookups = await loadLookups(churchId, [payment], []);
  return buildPaymentLedgerRow(payment, lookups);
}

/**
 * Adds the full ledger row to an event payload under `ledger`. Never throws:
 * an event must still go out with its basic payload if the lookup fails.
 */
export async function withLedgerRow(churchId: string, paymentId: string, base: Record<string, unknown>): Promise<Record<string, unknown>> {
  try {
    const ledger = await loadLedgerRowForPayment(churchId, paymentId);
    return ledger ? { ...base, ledger } : base;
  } catch (err) {
    console.error(`Failed to build ledger row for event payload paymentId=${paymentId}:`, err);
    return base;
  }
}
