/**
 * ISOLATED ACCOUNTING-POLICY DECISION — read this before touching this file.
 *
 * A confirmed, real inconsistency exists in this codebase's own donor-facing
 * financial documents, found while building the Aplos contribution
 * builder (Checkpoint 6):
 *
 *   - Donation RECEIPT (src/lib/giving/generateReceipt.ts:64):
 *       paymentAmountCents = payment.donationAmountCents ?? payment.amountCents
 *     The receipted "gift amount" EXCLUDES any donor-covered processing fee.
 *
 *   - Year-end STATEMENT (src/lib/donors/yearEndStatements.ts:143,157):
 *       gross = t.amountCents  (FinixTransfer.amountCents — the FULL charged
 *       amount, i.e. donation + donor-covered fee)
 *       recordedContributionAmountCents = gross - refunds - returns
 *     The annual recorded contribution amount INCLUDES the donor-covered fee.
 *
 * These are two independently IRS-relevant figures for the same donation
 * that currently disagree with each other in this codebase. Per the
 * approved Checkpoint 6 spec: "If WGC logic is genuinely inconsistent or
 * undefined: Do not guess. Isolate the choice behind a documented
 * accounting-policy function. Block real contribution posting until the
 * policy is confirmed. Complete all other builder and test work."
 *
 * This function is that isolation point. It deliberately returns an
 * UNRESOLVED result rather than picking either figure. Every caller in
 * this integration (contributionBuilder.ts, and eventually the real
 * contribution-POST path in a future checkpoint) MUST treat an unresolved
 * policy as a hard stop — never fall back to a default, never guess.
 *
 * To resolve: a human decision is required on which of the two documented
 * behaviors above (or a third, explicitly new one) Aplos should treat as
 * the charitable contribution amount, then this function should be updated
 * to return { resolved: true, amountCents: ... } computed from the
 * financial snapshot, and this comment updated to record the decision and
 * who made it.
 */

import type { ContributionFinancialSnapshot } from "./financialSnapshot";

export interface ContributionAmountPolicyResult {
  resolved: boolean;
  /** Only present when resolved: true. */
  contributionAmountCents?: number;
  /** Always present — explains the current state for logging/UI. */
  explanation: string;
}

export function resolveContributionAmountPolicy(snapshot: ContributionFinancialSnapshot): ContributionAmountPolicyResult {
  const receiptAmount = snapshot.donationAmountCents;
  const statementAmount = snapshot.totalChargedCents; // amountCents, i.e. donation + fee-covered

  if (receiptAmount === statementAmount) {
    // No donor-covered fee on this payment — both existing WGC documents
    // already agree for this specific record, so there is nothing
    // ambiguous to resolve here. Safe to use either value.
    return {
      resolved: true,
      contributionAmountCents: receiptAmount,
      explanation: "No donor-covered fee on this payment — receipt and year-end statement amounts already agree.",
    };
  }

  return {
    resolved: false,
    explanation:
      "This payment has a donor-covered fee, and WGC's own receipt and year-end statement logic disagree on the " +
      "resulting contribution amount (receipt excludes the covered fee; the year-end statement includes it). " +
      "This is a genuine, unresolved accounting-policy decision — see the file header comment in " +
      "contributionPolicy.ts. Real contribution posting is blocked for this payment until a decision is made.",
  };
}
