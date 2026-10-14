import { prisma } from "@/lib/prisma";
import { resolveContributionAmountPolicy } from "@/lib/integrations/aplos/contributionPolicy";
import type { ContributionFinancialSnapshot } from "@/lib/integrations/aplos/financialSnapshot";

/**
 * Turns a settled WGC settlement into a plan of gifts to record in Planning
 * Center. DATABASE ONLY — no network — so it is cheap, repeatable and safe to
 * run in dry-run mode. Provider-neutral eligibility (settled? every transfer
 * has a payment? fees landed? totals reconcile?) deliberately mirrors the
 * Aplos reconciliation; it is re-implemented here rather than extracted so
 * the shipped Aplos integration is not touched by this change.
 */

export type SkipReason =
  | "REFUNDED"
  | "PARTIALLY_REFUNDED"
  | "RETURNED"
  | "NOT_SUCCEEDED"
  | "DONOR_COVERED_FEE"
  | "GOODS_OR_SERVICES"
  | "UNSUPPORTED_PAYMENT_METHOD";

/** Plain-language, church-facing explanation for every skip. Never a raw error. */
export const SKIP_MESSAGES: Record<SkipReason, string> = {
  REFUNDED: "Refunded in WGC before it was sent, so there is nothing to record.",
  PARTIALLY_REFUNDED: "Partially refunded in WGC before it was sent. Enter it in Planning Center manually for the amount you kept.",
  RETURNED: "The bank returned this payment, so there is nothing to record.",
  NOT_SUCCEEDED: "This payment did not complete successfully, so it was not recorded.",
  DONOR_COVERED_FEE: "The donor covered the processing fee. WGC has not yet decided how that should be recorded as a donation amount, so it was not sent.",
  GOODS_OR_SERVICES: "Includes goods or services (for example an event ticket), so only part of it is a donation. Enter it in Planning Center manually.",
  UNSUPPORTED_PAYMENT_METHOD: "Paid with a method that isn't supported for Planning Center yet.",
};

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
  const donationAmountCents = payment.donationAmountCents ?? payment.amountCents;
  const processorFee = payment.actualFinixFeesCents ?? 0;
  const applicationFee = transfer.applicationFeeCents ?? 0;

  const snapshot: ContributionFinancialSnapshot = {
    paymentId: payment.id,
    finixTransferId: transfer.finixTransferId,
    donorId: payment.donorId,
    fundId: payment.fundId,
    isAnonymous: payment.isAnonymous,
    donationAmountCents,
    feeCoveredCents: payment.feeCoveredCents ?? 0,
    totalChargedCents: payment.amountCents,
    processorFeeCents: payment.actualFinixFeesCents,
    applicationFeeCents: transfer.applicationFeeCents,
    goodsServicesProvided: payment.goodsServicesProvided,
    goodsServicesFairMarketValueCents: null,
  };

  const base = {
    paymentId: payment.id,
    finixTransferId: transfer.finixTransferId,
    donorId: payment.donorId,
    fundId: payment.fundId,
    isAnonymous: payment.isAnonymous,
    receivedOn: payment.createdAt.toISOString().slice(0, 10),
    feeCents: -(processorFee + applicationFee),
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

  // WGC's own receipt and year-end statement disagree about the amount of a
  // gift where the donor covered the fee; the Aplos integration blocks on the
  // same unresolved policy. Reuse that single decision point so resolving it
  // there resolves it here too.
  const policy = resolveContributionAmountPolicy(snapshot);
  if (!policy.resolved || policy.contributionAmountCents === undefined) return skip("DONOR_COVERED_FEE");

  return { ...base, amountCents: policy.contributionAmountCents, decision: { kind: "PUSH" } };
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

  const gifts = transfers.map((t) => {
    const payment = paymentById.get(t.paymentId!)!;
    return classifyPayment(payment, t, payment.finixPaymentInstrumentId ? instrumentById.get(payment.finixPaymentInstrumentId) : undefined);
  });

  // Fees only matter for gifts we will actually record; a refunded payment may
  // never get fee data and must not block the rest of the settlement.
  const awaitingFees = gifts.some((g) => {
    if (g.decision.kind !== "PUSH") return false;
    const payment = paymentById.get(g.paymentId)!;
    const transfer = transfers.find((t) => t.paymentId === g.paymentId)!;
    return payment.actualFinixFeesCents === null || payment.actualFinixFeesCents === undefined || transfer.applicationFeeCents === null || transfer.applicationFeeCents === undefined;
  });
  if (awaitingFees) {
    return { eligible: false, awaitingFees: true, reasons: [], safeMessage: describeBlock([], true), gifts: [], settledAt: settlement.settledAt };
  }

  return { eligible: true, awaitingFees: false, reasons: [], safeMessage: "Eligible.", gifts, settledAt: settlement.settledAt };
}
