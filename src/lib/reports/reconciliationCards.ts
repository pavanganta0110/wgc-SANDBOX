import { formatCents } from "@/lib/format";
import type { BankReconciliation } from "@/lib/reports/bankReconciliation";

export interface ReconCard {
  label: string;
  value: string;
  note?: string;
}

const payouts = (n: number) => `${n} ${n === 1 ? "payout" : "payouts"}`;

/**
 * The cards and explanation under Insights' payments summary. A fee, refund or return figure appears only when
 * something was actually charged: no "$0.00" fee cards, and the wording never mentions a charge that did not happen.
 */
export function buildReconciliationCards(recon: BankReconciliation, coveredByPayersCents: number) {
  const covered = Math.max(0, Math.min(coveredByPayersCents, recon.feesCents));
  const paidByOrganization = recon.feesCents - covered;

  const charges: ReconCard[] = [{ label: "Total Charged", value: formatCents(recon.chargedCents) }];
  if (recon.feesCents > 0) charges.push({ label: "Fees Charged", value: formatCents(recon.feesCents), note: "All fees charged, listed below" });
  if (covered > 0) {
    charges.push({
      label: "Fees Covered by Payers",
      value: formatCents(covered),
      note: `Payments excluding these fees: ${formatCents(recon.chargedCents - covered)}`,
    });
  }
  if (paidByOrganization > 0) {
    charges.push({
      label: "Fees Paid by Organization",
      value: formatCents(paidByOrganization),
      note: recon.payoutFeeCount > 0 ? `Includes ${formatCents(recon.payoutFeeCents)} in payout fees (${payouts(recon.payoutFeeCount)})` : "Fees not covered by payers",
    });
  }

  const bank: ReconCard[] = [];
  if (recon.refundedCents !== 0) bank.push({ label: "Refunds & Returns", value: formatCents(recon.refundedCents) });
  bank.push({ label: "Net After Fees", value: formatCents(recon.netAfterFeesCents) });
  bank.push({
    label: "Deposited to Bank",
    value: formatCents(recon.depositedCents),
    note:
      recon.pulledBackCents > 0
        ? `${payouts(recon.depositCount)}; ${formatCents(recon.pulledBackCents)} also pulled from your bank for fees`
        : payouts(recon.depositCount),
  });
  bank.push({ label: "Awaiting Deposit", value: formatCents(recon.awaitingDepositCents), note: "Money still in flight" });

  const subtract = [recon.refundedCents !== 0 ? "Refunds & Returns" : null, recon.feesCents > 0 ? "Fees Charged" : null].filter(Boolean);
  const sentences: string[] = [`Net After Fees = Total Charged${subtract.map((s) => ` − ${s}`).join("")}.`];
  if (covered > 0 && paidByOrganization > 0) sentences.push("Fees Charged = Fees Covered by Payers + Fees Paid by Organization.");
  if (recon.payoutFeeCount > 0) sentences.push("A fixed fee, about 50¢, is charged each time a payout is sent to your bank.");
  sentences.push(
    recon.feesCents > 0 || recon.pendingFeeCount > 0
      ? "Net After Fees should match Deposited to Bank once money has landed: payouts arrive one to two business days after payments, and processing fees can take until about the 15th of the next month to finalize."
      : "Net After Fees should match Deposited to Bank once money has landed: payouts arrive one to two business days after payments."
  );
  if (recon.pendingFeeCount > 0) {
    sentences.push(
      `${recon.pendingFeeCount} recent ${recon.pendingFeeCount === 1 ? "payment doesn't" : "payments don't"} have final fees yet, so Net After Fees may be higher than what reaches your bank.`
    );
  }

  return { charges, bank, caption: sentences.join(" "), showFeeTypes: recon.feeTypes.length > 0 };
}
