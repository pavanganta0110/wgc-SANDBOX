import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { reconcileSettlement, type ReconciliationResult } from "./settlementReconciliation";
import { resolveContributionAmountPolicy } from "./contributionPolicy";
import type { ContributionFinancialSnapshot } from "./financialSnapshot";
import type { AplosContributionInput, AplosContributionLineInput } from "./types";

/**
 * Builds the Aplos contribution payload(s) for a settlement. Never makes a
 * network call and never POSTs to Aplos — pure, deterministic construction
 * from already-reconciled, already-validated data. Per the approved
 * Checkpoint 6 scope, this checkpoint stops here; the real POST happens in
 * a future checkpoint, gated on real pilot credentials.
 *
 * DOCUMENTED DESIGN DECISION — one Contribution per original donation date,
 * not one per settlement:
 *
 * Aplos's Contribution object has exactly ONE top-level `date` field
 * (confirmed from official docs — no per-line date override exists in the
 * documented request shape). A settlement can legitimately include
 * donations made on different calendar days that all happened to settle
 * together. To preserve each donor's real original contribution date (per
 * the approved spec's "use the original contribution date for donor
 * contribution records") rather than collapsing every donation onto one
 * arbitrary date, this builder groups a settlement's payments by the
 * calendar date of Payment.createdAt and produces one AplosContributionInput
 * per group. The settlement/deposit date itself (a distinct concept from
 * the donation date) is recorded in `description`, the only place the
 * confirmed schema allows a second, safe WGC reference — never fabricated
 * as a second `date` field, since none exists. THIS BEHAVIOR IS FLAGGED FOR
 * CONFIRMATION, not silently assumed, per the approved spec's explicit
 * instruction for the case where Aplos supports only one date.
 *
 * DOCUMENTED DESIGN DECISION — expense_amount is processor fee + application
 * fee combined: Aplos's Contribution schema has exactly one `expense_amount`
 * (line-level) deducted against exactly one `expense_account`
 * (contribution-level) — matching AplosAccountConfiguration's single
 * "processing-fee expense account." WGC persists processor fee
 * (Payment.actualFinixFeesCents) and application fee
 * (FinixTransfer.applicationFeeCents) as two independent values with no
 * existing WGC receipt/statement precedent addressing this Aplos-specific
 * mapping question (unlike the donor-covered-fee amount, this is not an
 * internal WGC inconsistency to resolve — it is a new mapping decision for
 * an Aplos-defined field). Standard double-entry accounting requires the
 * books to balance: net deposit + total fees deducted = gross contribution.
 * Using their sum is the value that makes that identity hold, so
 * expense_amount = processorFeeCents + applicationFeeCents. Documented here
 * as WGC's own interpretation, not something Aplos or WGC's existing
 * documents confirm — open for correction.
 */

export type ContributionBuildBlockReason = ReconciliationResult["reasons"][number] | "POLICY_UNRESOLVED";

export interface ContributionBuildResult {
  eligible: boolean;
  awaitingFees: boolean;
  reasons: ContributionBuildBlockReason[];
  safeMessage: string;
  contributions: BuiltContribution[];
}

export interface BuiltContribution {
  originalDonationDate: string; // yyyy-MM-dd
  payload: AplosContributionInput;
  payloadHash: string;
  paymentIds: string[];
  totalContributionAmountCents: number;
}

export async function buildSettlementContributions(finixSettlementId: string, churchId: string): Promise<ContributionBuildResult> {
  const reconciliation = await reconcileSettlement(finixSettlementId, churchId);
  if (!reconciliation.eligible || !reconciliation.snapshot) {
    return {
      eligible: false,
      awaitingFees: reconciliation.awaitingFees,
      reasons: reconciliation.reasons,
      safeMessage: reconciliation.safeMessage,
      contributions: [],
    };
  }

  const { payments } = reconciliation.snapshot;

  // Resolve the contribution-amount policy for every payment FIRST — if any
  // single payment is unresolved, the entire settlement build is blocked
  // (never a partial batch; matches the "no partial synchronization" rule
  // already enforced for unsupported adjustments).
  const policyResults = payments.map((p) => ({ payment: p, policy: resolveContributionAmountPolicy(p) }));
  if (policyResults.some((r) => !r.policy.resolved)) {
    return {
      eligible: false,
      awaitingFees: false,
      reasons: ["POLICY_UNRESOLVED"],
      safeMessage:
        "One or more payments in this settlement have a donor-covered fee, and the Aplos contribution-amount " +
        "accounting policy has not yet been confirmed (see contributionPolicy.ts). Contact WGC support.",
      contributions: [],
    };
  }

  const [accountConfig, mappings] = await Promise.all([
    prisma.aplosAccountConfiguration.findUnique({ where: { churchId } }),
    prisma.aplosPurposeMapping.findMany({ where: { churchId } }),
  ]);
  // reconcileSettlement() already guarantees accountConfig exists and every
  // fund is mapped (or a default Purpose exists) before eligible: true —
  // these are re-fetched here (not passed through) so this function has no
  // hidden dependency on reconciliation's internal state, only its
  // eligible/snapshot contract.
  if (!accountConfig) {
    return { eligible: false, awaitingFees: false, reasons: ["ACCOUNT_CONFIGURATION_MISSING"], safeMessage: "Account configuration is missing.", contributions: [] };
  }
  const mappingByFundId = new Map(mappings.map((m) => [m.wgcFundId, m]));

  const paymentRows = await prisma.payment.findMany({ where: { id: { in: payments.map((p) => p.paymentId) } } });
  const paymentById = new Map(paymentRows.map((p) => [p.id, p]));
  const donorIds = [...new Set(payments.map((p) => p.donorId).filter((id): id is string => !!id))];
  const donors = donorIds.length ? await prisma.donor.findMany({ where: { id: { in: donorIds } } }) : [];
  const donorById = new Map(donors.map((d) => [d.id, d]));

  // Group by the original donation's calendar date (Payment.createdAt) —
  // see the file header comment for why.
  const groups = new Map<string, ContributionFinancialSnapshot[]>();
  for (const snap of payments) {
    const row = paymentById.get(snap.paymentId);
    const dateKey = (row?.createdAt ?? new Date()).toISOString().slice(0, 10);
    const list = groups.get(dateKey) ?? [];
    list.push(snap);
    groups.set(dateKey, list);
  }

  const contributions: BuiltContribution[] = [];

  for (const [dateKey, groupPayments] of groups) {
    const lines: AplosContributionLineInput[] = [];
    let totalContributionAmountCents = 0;

    for (const p of groupPayments) {
      const mapping = p.fundId ? mappingByFundId.get(p.fundId) : undefined;
      const purposeId = mapping ? Number(mapping.aplosPurposeId) : Number(accountConfig.defaultPurposeId);

      const policyResult = resolveContributionAmountPolicy(p);
      // Already confirmed resolved for every payment above — non-null by
      // construction, asserted here only to satisfy the type checker.
      const contributionAmountCents = policyResult.contributionAmountCents!;
      totalContributionAmountCents += contributionAmountCents;

      const donor = p.donorId ? donorById.get(p.donorId) : undefined;
      const expenseAmountCents = (p.processorFeeCents ?? 0) + (p.applicationFeeCents ?? 0);

      lines.push({
        contact: p.isAnonymous || !donor
          ? { firstname: "Anonymous", lastname: "Donor", type: "individual" }
          : { firstname: donor.name?.split(" ")[0] || donor.name || "Donor", lastname: donor.name?.split(" ").slice(1).join(" ") || "", type: "individual", email: donor.email ?? undefined },
        purpose: { id: purposeId },
        note: `WGC payment ${p.paymentId}`,
        amount: centsToDecimalDollars(contributionAmountCents),
        expense_amount: centsToDecimalDollars(expenseAmountCents),
        is_ntd: p.goodsServicesProvided,
        ntd_amount: p.goodsServicesProvided ? centsToDecimalDollars(p.goodsServicesFairMarketValueCents ?? 0) : undefined,
      });
    }

    const payload: AplosContributionInput = {
      name: `WGC settlement ${finixSettlementId} — ${dateKey}`,
      description: `Synced from WGC Payments. Settlement: ${finixSettlementId}. Original donation date: ${dateKey}.`,
      source_url: `https://www.wgcpayments.com/merchant/settlements/${reconciliation.snapshot.settlementId}`,
      date: dateKey,
      deposit_account: { account_number: Number(accountConfig.depositAccountId) },
      expense_account: { account_number: Number(accountConfig.processingFeeExpenseAccountId) },
      lines,
    };

    contributions.push({
      originalDonationDate: dateKey,
      payload,
      payloadHash: hashPayload(payload),
      paymentIds: groupPayments.map((p) => p.paymentId),
      totalContributionAmountCents,
    });
  }

  return { eligible: true, awaitingFees: false, reasons: [], safeMessage: "Ready to synchronize.", contributions };
}

/**
 * Converts integer cents to Aplos's documented decimal-dollar string
 * representation (e.g. "amount": 100 for a $100.00 contribution) via exact
 * string manipulation — never float division, which could introduce
 * rounding error for financial data. Returned as a number only at the very
 * last step (JSON.stringify of an integer-plus-two-decimal string parses
 * back exactly for any value under Number.MAX_SAFE_INTEGER / 100).
 */
function centsToDecimalDollars(cents: number): number {
  const negative = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const wholePart = Math.trunc(abs / 100);
  const centPart = String(abs % 100).padStart(2, "0");
  const value = Number(`${wholePart}.${centPart}`);
  return negative ? -value : value;
}

function hashPayload(payload: AplosContributionInput): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
