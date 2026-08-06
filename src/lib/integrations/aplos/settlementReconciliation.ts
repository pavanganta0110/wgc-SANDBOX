import { prisma } from "@/lib/prisma";
import type { SettlementFinancialSnapshot } from "./financialSnapshot";

/**
 * Validates a settlement's eligibility for Aplos synchronization and
 * builds its financial snapshot in the same pass — every check below runs
 * against actual persisted data, never recalculated or estimated.
 */

export type ReconciliationBlockReason =
  | "NOT_SETTLED"
  | "NO_TRANSFERS"
  | "CROSS_CHURCH_TRANSFER"
  | "MISSING_PAYMENT"
  | "MISSING_PROCESSOR_FEE"
  | "MISSING_APPLICATION_FEE"
  | "UNSUPPORTED_ADJUSTMENTS"
  | "TOTALS_DO_NOT_RECONCILE"
  | "MAPPING_REQUIRED"
  | "ACCOUNT_CONFIGURATION_MISSING"
  | "ALREADY_SYNCED";

export interface ReconciliationResult {
  eligible: boolean;
  /** BLOCKED_AWAITING_FEES is a distinct outcome from every other block
   * reason — it means the settlement is otherwise fine and should be
   * retried once Finix's async fee sync lands, not treated as a permanent
   * BLOCKED state requiring merchant action. */
  awaitingFees: boolean;
  reasons: ReconciliationBlockReason[];
  safeMessage: string;
  snapshot: SettlementFinancialSnapshot | null;
}

const UNSUPPORTED_ADJUSTMENTS_MESSAGE =
  "This settlement contains refunds, returns, disputes, or other adjustments that are not supported by the current Aplos integration.";

export async function reconcileSettlement(finixSettlementId: string, churchId: string): Promise<ReconciliationResult> {
  const reasons: ReconciliationBlockReason[] = [];

  const settlement = await prisma.finixSettlement.findUnique({ where: { finixSettlementId } });
  if (!settlement || settlement.churchId !== churchId) {
    return { eligible: false, awaitingFees: false, reasons: ["NOT_SETTLED"], safeMessage: "Settlement not found for this organization.", snapshot: null };
  }

  // FinixSettlement.state === "SETTLED" is the ONLY finality trigger — the
  // admin-controlled reconciliationStatus is never treated as a finality
  // signal, per the approved spec.
  if (settlement.state !== "SETTLED") {
    reasons.push("NOT_SETTLED");
  }

  // Any non-zero adjustment blocks the whole settlement — never partially
  // synchronized. Checked before anything else that could be expensive.
  const hasUnsupportedAdjustments =
    (settlement.refundAmountCents ?? 0) !== 0 ||
    (settlement.returnAmountCents ?? 0) !== 0 ||
    (settlement.disputeAmountCents ?? 0) !== 0 ||
    (settlement.otherAdjustmentAmountCents ?? 0) !== 0;
  if (hasUnsupportedAdjustments) {
    reasons.push("UNSUPPORTED_ADJUSTMENTS");
  }

  const transfers = await prisma.finixTransfer.findMany({ where: { finixSettlementId, state: "SUCCEEDED" } });
  if (transfers.length === 0) {
    reasons.push("NO_TRANSFERS");
    return {
      eligible: false,
      awaitingFees: false,
      reasons,
      safeMessage: describeReasons(reasons),
      snapshot: null,
    };
  }

  // Every included transfer must belong to this church — defensive check
  // even though the query is already scoped, in case of a data anomaly.
  if (transfers.some((t) => t.churchId !== churchId)) {
    reasons.push("CROSS_CHURCH_TRANSFER");
  }

  const paymentIds = transfers.map((t) => t.paymentId).filter((id): id is string => !!id);
  const payments = await prisma.payment.findMany({ where: { id: { in: paymentIds } } });
  const paymentById = new Map(payments.map((p) => [p.id, p]));

  let missingPayment = false;
  let missingProcessorFee = false;
  let missingApplicationFee = false;

  const snapshotPayments: SettlementFinancialSnapshot["payments"] = [];

  for (const transfer of transfers) {
    const payment = transfer.paymentId ? paymentById.get(transfer.paymentId) : undefined;
    if (!payment) {
      missingPayment = true;
      continue;
    }
    if (payment.churchId !== churchId) {
      reasons.push("CROSS_CHURCH_TRANSFER");
      continue;
    }
    if (payment.actualFinixFeesCents === null || payment.actualFinixFeesCents === undefined) {
      missingProcessorFee = true;
    }
    if (transfer.applicationFeeCents === null || transfer.applicationFeeCents === undefined) {
      missingApplicationFee = true;
    }

    snapshotPayments.push({
      paymentId: payment.id,
      finixTransferId: transfer.finixTransferId,
      donorId: payment.donorId,
      fundId: payment.fundId,
      isAnonymous: payment.isAnonymous,
      donationAmountCents: payment.donationAmountCents ?? payment.amountCents,
      feeCoveredCents: payment.feeCoveredCents ?? 0,
      totalChargedCents: payment.amountCents,
      processorFeeCents: payment.actualFinixFeesCents,
      applicationFeeCents: transfer.applicationFeeCents,
      goodsServicesProvided: payment.goodsServicesProvided,
      goodsServicesFairMarketValueCents: payment.goodsServicesFairMarketValueCents,
    });
  }

  if (missingPayment) reasons.push("MISSING_PAYMENT");

  const awaitingFees = missingProcessorFee || missingApplicationFee;
  if (missingProcessorFee) reasons.push("MISSING_PROCESSOR_FEE");
  if (missingApplicationFee) reasons.push("MISSING_APPLICATION_FEE");

  // Settlement totals reconciliation: the sum of included transfer amounts
  // must agree with FinixSettlement.totalAmountCents (the processor-
  // reported gross for this settlement). Any real discrepancy blocks sync
  // rather than sending an unreconciled batch to Aplos.
  const sumOfTransfers = transfers.reduce((sum, t) => sum + (t.amountCents ?? 0), 0);
  if (settlement.totalAmountCents !== null && settlement.totalAmountCents !== undefined && sumOfTransfers !== settlement.totalAmountCents) {
    reasons.push("TOTALS_DO_NOT_RECONCILE");
  }

  // Mapping/account-configuration check — every payment's fund must have a
  // saved Purpose mapping OR an explicit default Purpose must be configured.
  const accountConfig = await prisma.aplosAccountConfiguration.findUnique({ where: { churchId } });
  if (!accountConfig) {
    reasons.push("ACCOUNT_CONFIGURATION_MISSING");
  } else {
    const fundIds = [...new Set(snapshotPayments.map((p) => p.fundId).filter((id): id is string => !!id))];
    if (fundIds.length > 0) {
      const mappings = await prisma.aplosPurposeMapping.findMany({ where: { churchId, wgcFundId: { in: fundIds } } });
      const mappedFundIds = new Set(mappings.map((m) => m.wgcFundId));
      const unmapped = fundIds.filter((id) => !mappedFundIds.has(id));
      if (unmapped.length > 0 && !accountConfig.defaultPurposeId) {
        reasons.push("MAPPING_REQUIRED");
      }
    }
    // A payment with no fund at all relies entirely on the default Purpose.
    const hasUnfundedPayment = snapshotPayments.some((p) => !p.fundId);
    if (hasUnfundedPayment && !accountConfig.defaultPurposeId) {
      reasons.push("MAPPING_REQUIRED");
    }
  }

  const alreadySynced = await prisma.aplosSyncRecord.findFirst({
    where: { churchId, settlementId: finixSettlementId, status: "SYNCED" },
  });
  if (alreadySynced) reasons.push("ALREADY_SYNCED");

  const snapshot: SettlementFinancialSnapshot = {
    settlementId: settlement.id,
    finixSettlementId: settlement.finixSettlementId,
    churchId,
    state: settlement.state,
    totalAmountCents: settlement.totalAmountCents,
    netAmountCents: settlement.netAmountCents,
    feeAmountCents: settlement.feeAmountCents,
    refundAmountCents: settlement.refundAmountCents,
    returnAmountCents: settlement.returnAmountCents,
    disputeAmountCents: settlement.disputeAmountCents,
    otherAdjustmentAmountCents: settlement.otherAdjustmentAmountCents,
    payments: snapshotPayments,
  };

  const eligible = reasons.length === 0;
  return {
    eligible,
    awaitingFees: !eligible && awaitingFees && !hasUnsupportedAdjustments && settlement.state === "SETTLED",
    reasons,
    safeMessage: eligible ? "Eligible for Aplos synchronization." : describeReasons(reasons),
    snapshot,
  };
}

function describeReasons(reasons: ReconciliationBlockReason[]): string {
  if (reasons.includes("UNSUPPORTED_ADJUSTMENTS")) return UNSUPPORTED_ADJUSTMENTS_MESSAGE;
  if (reasons.includes("ALREADY_SYNCED")) return "This settlement has already been synchronized to Aplos.";
  if (reasons.includes("NOT_SETTLED")) return "This settlement is not yet final (SETTLED) in Finix.";
  if (reasons.includes("NO_TRANSFERS")) return "This settlement has no successful transfers to synchronize.";
  if (reasons.includes("ACCOUNT_CONFIGURATION_MISSING")) return "Aplos deposit account, processing-fee expense account, and default Purpose are not configured.";
  if (reasons.includes("MAPPING_REQUIRED")) return "One or more funds in this settlement are not mapped to an Aplos Purpose, and no default Purpose is configured.";
  if (reasons.includes("MISSING_PROCESSOR_FEE") || reasons.includes("MISSING_APPLICATION_FEE")) {
    return "Processor or application fee data has not finished syncing for this settlement yet.";
  }
  if (reasons.includes("TOTALS_DO_NOT_RECONCILE")) return "This settlement's totals do not reconcile against its included transfers.";
  if (reasons.includes("MISSING_PAYMENT")) return "One or more transfers in this settlement could not be resolved to a WGC payment record.";
  if (reasons.includes("CROSS_CHURCH_TRANSFER")) return "This settlement includes a transfer that does not belong to this organization.";
  return "This settlement is not currently eligible for Aplos synchronization.";
}
