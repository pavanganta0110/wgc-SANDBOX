import { prisma } from "@/lib/prisma";
import { effectivePaymentStatuses } from "./giftOutcomes";

/**
 * Turns a settled WGC settlement into a plan of gifts to record in Planning
 * Center. DATABASE ONLY — no network — so it is cheap, repeatable and safe to
 * run in dry-run mode. Provider-neutral eligibility (settled? every transfer
 * has a payment? fees landed? totals reconcile?) deliberately mirrors the
 * Aplos reconciliation; it is re-implemented here rather than extracted so
 * the shipped Aplos integration is not touched by this change.
 */

import { SKIP_MESSAGES, type SkipReason } from "./syncTypes";

export { SKIP_MESSAGES };
export type { SkipReason };

export type PcoPaymentMethod = "card" | "ach";

export interface PlannedGift {
  paymentId: string;
  finixTransferId: string;
  donorId: string | null;
  fundId: string | null;
  isAnonymous: boolean;
  amountCents: number;
  /** YYYY-MM-DD, the ORIGINAL donation date (same choice the Aplos sync makes; UTC). */
  receivedOn: string;
  /** Negative integer (Planning Center convention) or 0. */
  feeCents: number;
  method: PcoPaymentMethod;
  cardBrand: string | null;
  cardSubtype: "credit" | "debit" | "prepaid" | "unknown" | null;
  last4: string | null;
  decision: { kind: "PUSH" } | { kind: "SKIP"; reason: SkipReason };
}

export type PlanBlockReason =
  | "NOT_SETTLED"
  | "NO_TRANSFERS"
  | "MISSING_PAYMENT"
  | "CROSS_CHURCH_TRANSFER"
  | "TOTALS_DO_NOT_RECONCILE";

export interface SettlementPlan {
  eligible: boolean;
  /** Otherwise fine; Finix's async fee sync hasn't landed yet. Retried, not a merchant problem. */
  awaitingFees: boolean;
  reasons: PlanBlockReason[];
  safeMessage: string;
  gifts: PlannedGift[];
  settledAt: Date | null;
}

const BLOCK_MESSAGES: Record<PlanBlockReason, string> = {
  NOT_SETTLED: "This settlement is not final in Finix yet.",
  NO_TRANSFERS: "This settlement has no successful transfers to record.",
  MISSING_PAYMENT: "One or more transfers in this settlement couldn't be matched to a WGC payment.",
  CROSS_CHURCH_TRANSFER: "This settlement includes a transfer that doesn't belong to this organization.",
  TOTALS_DO_NOT_RECONCILE: "This settlement's totals don't match its transfers yet. It will be retried automatically.",
};

export function describeBlock(reasons: PlanBlockReason[], awaitingFees: boolean): string {
  if (reasons.length > 0) return BLOCK_MESSAGES[reasons[0]];
  if (awaitingFees) return "Processing fee details from Finix haven't finished syncing yet. It will be retried automatically.";
  return "Eligible.";
}

export function toPcoMethod(paymentMethodType: string | null | undefined): PcoPaymentMethod | null {
  const t = (paymentMethodType ?? "").toLowerCase();
  if (["payment_card", "card", "google_pay", "apple_pay"].includes(t)) return "card";
  if (["bank_account", "bank", "ach"].includes(t)) return "ach";
  return null;
}

export function toCardSubtype(cardType: string | null | undefined): "credit" | "debit" | "prepaid" | "unknown" {
  const t = (cardType ?? "").toLowerCase();
  return t === "credit" || t === "debit" || t === "prepaid" ? t : "unknown";
}

interface PaymentRow {
  id: string;
  churchId: string;
  donorId: string | null;
  fundId: string | null;
  status: string;
  isAnonymous: boolean;
  amountCents: number;
  donationAmountCents: number | null;
  feeCoveredCents: number | null;
  paymentMethodType: string;
  cardBrand: string | null;
  actualFinixFeesCents: number | null;
  goodsServicesProvided: boolean;
  finixPaymentInstrumentId: string | null;
  createdAt: Date;
}
interface TransferRow {
  finixTransferId: string;
  churchId: string | null;
  paymentId: string | null;
  amountCents: number | null;
  applicationFeeCents: number | null;
}
interface InstrumentRow {
  finixPaymentInstrumentId: string;
  cardBrand: string | null;
  cardType: string | null;
  cardLast4: string | null;
  bankLast4: string | null;
}

/** Pure: classify one payment. Exported for tests. */
export function classifyPayment(payment: PaymentRow, transfer: TransferRow, instrument: InstrumentRow | undefined): PlannedGift {
  const method = toPcoMethod(payment.paymentMethodType);
  // The GIFT, without any processing fee the donor chose to cover on top (decision "A", confirmed by Collin Sansom).
  // That is the figure the donation receipt uses. The covered fee is shown on the WGC receipt and year-end statement
  // (when the church's settings show it); Planning Center has no field for it, so it is not recorded there.
  const donationAmountCents = payment.donationAmountCents ?? payment.amountCents;
  const donorCoveredFee = (payment.feeCoveredCents ?? 0) > 0;
  const processorFee = payment.actualFinixFeesCents ?? 0;
  const applicationFee = transfer.applicationFeeCents ?? 0;

  const base = {
    paymentId: payment.id,
    finixTransferId: transfer.finixTransferId,
    donorId: payment.donorId,
    fundId: payment.fundId,
    isAnonymous: payment.isAnonymous,
    receivedOn: payment.createdAt.toISOString().slice(0, 10),
    // When the donor covered the fee, the church paid none of it, so there is no cost to record. Otherwise it is the
    // real processing cost, as a negative integer (Planning Center's convention).
    feeCents: donorCoveredFee ? 0 : 0 - (processorFee + applicationFee), // `0 -` (not unary minus) so a zero fee is 0, never -0
    method: method ?? ("card" as PcoPaymentMethod),
    cardBrand: method === "card" ? instrument?.cardBrand ?? payment.cardBrand : null,
    cardSubtype: method === "card" ? toCardSubtype(instrument?.cardType) : null,
    last4: (method === "card" ? instrument?.cardLast4 : instrument?.bankLast4) ?? null,
  };

  const skip = (reason: SkipReason): PlannedGift => ({ ...base, amountCents: donationAmountCents, decision: { kind: "SKIP", reason } });

  if (payment.status === "REFUNDED") return skip("REFUNDED");
  if (payment.status === "PARTIALLY_REFUNDED") return skip("PARTIALLY_REFUNDED");
  if (payment.status === "RETURNED") return skip("RETURNED");
  if (payment.status !== "SUCCEEDED") return skip("NOT_SUCCEEDED");
  if (!method) return skip("UNSUPPORTED_PAYMENT_METHOD");
  if (payment.goodsServicesProvided) return skip("GOODS_OR_SERVICES");

  return { ...base, amountCents: donationAmountCents, decision: { kind: "PUSH" } };
}

/** Builds the plan for one settlement. Every query is scoped to the church. */
export async function buildSettlementPlan(churchId: string, finixSettlementId: string): Promise<SettlementPlan> {
  const blocked = (reasons: PlanBlockReason[], settledAt: Date | null = null): SettlementPlan => ({
    eligible: false, awaitingFees: false, reasons, safeMessage: describeBlock(reasons, false), gifts: [], settledAt,
  });

  const settlement = await prisma.finixSettlement.findUnique({ where: { finixSettlementId } });
  if (!settlement || settlement.churchId !== churchId) return blocked(["NOT_SETTLED"]);
  if (settlement.state !== "SETTLED") return blocked(["NOT_SETTLED"], settlement.settledAt);

  const transfers = await prisma.finixTransfer.findMany({ where: { finixSettlementId, state: "SUCCEEDED" } });
  if (transfers.length === 0) return blocked(["NO_TRANSFERS"], settlement.settledAt);
  if (transfers.some((t) => t.churchId !== churchId)) return blocked(["CROSS_CHURCH_TRANSFER"], settlement.settledAt);

  const paymentIds = transfers.map((t) => t.paymentId).filter((id): id is string => Boolean(id));
  const payments = await prisma.payment.findMany({ where: { id: { in: paymentIds }, churchId } });
  const paymentById = new Map(payments.map((p) => [p.id, p]));
  if (transfers.some((t) => !t.paymentId || !paymentById.has(t.paymentId))) return blocked(["MISSING_PAYMENT"], settlement.settledAt);

  const sumOfTransfers = transfers.reduce((sum, t) => sum + (t.amountCents ?? 0), 0);
  if (settlement.totalAmountCents !== null && settlement.totalAmountCents !== undefined && sumOfTransfers !== settlement.totalAmountCents) {
    return blocked(["TOTALS_DO_NOT_RECONCILE"], settlement.settledAt);
  }

  const instrumentIds = [...new Set(payments.map((p) => p.finixPaymentInstrumentId).filter((id): id is string => Boolean(id)))];
  const instruments = instrumentIds.length
    ? await prisma.finixPaymentInstrumentSnapshot.findMany({ where: { finixPaymentInstrumentId: { in: instrumentIds } } })
    : [];
  const instrumentById = new Map(instruments.map((i) => [i.finixPaymentInstrumentId, i]));

  // A refund doesn't change Payment.status, so work out each gift's real state from the refund and return rows.
  const statusById = await effectivePaymentStatuses(churchId, payments);
  const gifts = transfers
    .filter((t) => statusById.get(t.paymentId!) !== "REFUND_PENDING") // a refund in progress: decide once it settles
    .map((t) => {
      const payment = paymentById.get(t.paymentId!)!;
      return classifyPayment({ ...payment, status: statusById.get(payment.id) ?? payment.status }, t, payment.finixPaymentInstrumentId ? instrumentById.get(payment.finixPaymentInstrumentId) : undefined);
    });

  // Fees only matter for gifts we will actually record; a refunded payment may
  // never get fee data and must not block the rest of the settlement.
  const awaitingFees = gifts.some((g) => {
    if (g.decision.kind !== "PUSH") return false;
    const payment = paymentById.get(g.paymentId)!;
    // A gift whose fee the donor covered has no church cost to record, so it never waits for fee data.
    if ((payment.feeCoveredCents ?? 0) > 0) return false;
    const transfer = transfers.find((t) => t.paymentId === g.paymentId)!;
    return payment.actualFinixFeesCents === null || payment.actualFinixFeesCents === undefined || transfer.applicationFeeCents === null || transfer.applicationFeeCents === undefined;
  });
  if (awaitingFees) {
    return { eligible: false, awaitingFees: true, reasons: [], safeMessage: describeBlock([], true), gifts: [], settledAt: settlement.settledAt };
  }

  return { eligible: true, awaitingFees: false, reasons: [], safeMessage: "Eligible.", gifts, settledAt: settlement.settledAt };
}

// ───────────────────────── "as soon as it's paid": one batch per church per day ─────────────────────────

/** Sync units are either a settlement (its Finix id) or a calendar day of payments (`day:YYYY-MM-DD`). */
export const DAY_UNIT_PREFIX = "day:";
export const dayUnitKey = (dateKey: string) => `${DAY_UNIT_PREFIX}${dateKey}`;
export function parseDayUnitKey(unitKey: string): string | null {
  const m = unitKey.startsWith(DAY_UNIT_PREFIX) ? unitKey.slice(DAY_UNIT_PREFIX.length) : null;
  return m && /^\d{4}-\d{2}-\d{2}$/.test(m) ? m : null;
}
/** The UTC calendar day of a payment (the same day `received_at` uses). */
export const dateKeyOf = (d: Date) => d.toISOString().slice(0, 10);

// Payments that reached a final state worth recording. A gift refunded/returned before we got to it is recorded as
// SKIPPED (visible, with a reason); one still PENDING/FAILED/CANCELED is ignored until it succeeds.
export const DAY_PLAN_STATUSES = ["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED", "RETURNED"];

function dayBounds(dateKey: string, since: Date | null) {
  const start = new Date(`${dateKey}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { gte: since && since > start ? since : start, lt: end };
}

/**
 * The gifts to record for one church on one day. DATABASE ONLY. Unlike a settlement plan it needs no settlement and
 * does not wait for fee data: a fee-covered gift has no church cost, and for the rest the fee is recorded only if
 * Finix has already reported it. `since` is the go-live moment, so history is never back-posted.
 */
export async function buildDayPlan(churchId: string, dateKey: string, since: Date | null): Promise<SettlementPlan> {
  const payments = await prisma.payment.findMany({
    where: { churchId, status: { in: DAY_PLAN_STATUSES }, createdAt: dayBounds(dateKey, since) },
    orderBy: { createdAt: "asc" },
  });
  const day = new Date(`${dateKey}T00:00:00.000Z`);
  if (payments.length === 0) return { eligible: true, awaitingFees: false, reasons: [], safeMessage: "Nothing to send.", gifts: [], settledAt: day };

  const transferIds = payments.map((p) => p.finixTransferId).filter((id): id is string => Boolean(id));
  const transfers = transferIds.length ? await prisma.finixTransfer.findMany({ where: { churchId, finixTransferId: { in: transferIds } } }) : [];
  const transferById = new Map(transfers.map((t) => [t.finixTransferId, t]));

  const instrumentIds = [...new Set(payments.map((p) => p.finixPaymentInstrumentId).filter((id): id is string => Boolean(id)))];
  const instruments = instrumentIds.length ? await prisma.finixPaymentInstrumentSnapshot.findMany({ where: { finixPaymentInstrumentId: { in: instrumentIds } } }) : [];
  const instrumentById = new Map(instruments.map((i) => [i.finixPaymentInstrumentId, i]));

  const statusById = await effectivePaymentStatuses(churchId, payments);
  const gifts = payments
    .filter((payment) => statusById.get(payment.id) !== "REFUND_PENDING") // a refund in progress: decide once it settles
    .map((payment) => {
    const transfer =
      (payment.finixTransferId ? transferById.get(payment.finixTransferId) : undefined) ??
      // The transfer row can lag the payment; the gift doesn't need it (only the application fee, if known).
      { finixTransferId: payment.finixTransferId ?? payment.id, churchId, paymentId: payment.id, amountCents: payment.amountCents, applicationFeeCents: null };
    return classifyPayment({ ...payment, status: statusById.get(payment.id) ?? payment.status }, transfer, payment.finixPaymentInstrumentId ? instrumentById.get(payment.finixPaymentInstrumentId) : undefined);
  });

  return { eligible: true, awaitingFees: false, reasons: [], safeMessage: "Eligible.", gifts, settledAt: day };
}

/**
 * Cheap pre-check (no Planning Center calls): does this day have a paid gift we haven't recorded, or one still
 * waiting to be sent? Lets the trigger do nothing when it fires for a gift that is already in Planning Center.
 */
export async function dayHasWork(churchId: string, dateKey: string, since: Date | null): Promise<boolean> {
  const payments = await prisma.payment.findMany({
    where: { churchId, status: { in: DAY_PLAN_STATUSES }, createdAt: dayBounds(dateKey, since) },
    select: { id: true },
  });
  if (payments.length === 0) return false;
  const records = await prisma.planningCenterDonationRecord.findMany({
    where: { churchId, paymentId: { in: payments.map((p) => p.id) } },
    select: { paymentId: true, status: true },
  });
  const byPayment = new Map(records.map((r) => [r.paymentId, r.status]));
  return payments.some((p) => {
    const status = byPayment.get(p.id);
    return status === undefined || status === "PENDING" || status === "SENDING";
  });
}
