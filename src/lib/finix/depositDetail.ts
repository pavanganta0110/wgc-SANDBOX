import { prisma } from "@/lib/prisma";
import { resolveActiveBankAccount } from "@/lib/organization/bankAccountResolver";

/**
 * Shared data loader for a single deposit's full detail view — used by both
 * the right-side drawer and the "View All Details" page so the two never
 * drift apart, mirroring loadRefundDetail / loadBankReturnDetail.
 *
 * A deposit is Finix's funding_transfer_attempt: the actual movement of
 * settled funds out to the church's connected bank account. Each one
 * bundles one or more settlements, which in turn bundle payments. We
 * follow those joins here so the detail view can show which payments and
 * refunds actually made up the money that hit the bank.
 */
export async function loadDepositDetail(depositId: string, churchId: string) {
  const deposit = await prisma.finixFundingTransferAttempt.findFirst({
    where: { finixFundingTransferAttemptId: depositId, churchId },
  });
  if (!deposit) return null;

  const church = await prisma.church.findUnique({ where: { id: churchId } });

  // Finix's funding attempt links to a single settlement id today, but the
  // spec treats it as a bundle — this pulls just that one settlement,
  // plus any others we've explicitly seen linked to the same deposit
  // through the transfer path. Ordered so the primary settlement is first.
  const settlements = deposit.finixSettlementId
    ? await prisma.finixSettlement.findMany({
        where: { finixSettlementId: deposit.finixSettlementId, churchId },
      })
    : [];

  const settlementIds = settlements.map((s) => s.finixSettlementId);
  const payments = settlementIds.length
    ? await prisma.finixTransfer.findMany({
        where: { churchId, finixSettlementId: { in: settlementIds } },
      })
    : [];

  const paymentIds = payments.map((p) => p.finixTransferId);
  const affectingRefunds = paymentIds.length
    ? await prisma.finixRefundOrReversal.findMany({
        where: { churchId, finixOriginalTransferId: { in: paymentIds } },
      })
    : [];
  const affectingReturns = paymentIds.length
    ? await prisma.bankReturn.findMany({
        where: { churchId, originalTransferId: { in: paymentIds } },
      })
    : [];

  // Enrich the deposit's bank display from the verified payout bank
  // account (Organization Profile's own source of truth) whenever the
  // funding-transfer row itself is missing bank name/type — Finix's
  // funding-transfer payload doesn't always carry this, confirmed against
  // live data (every production deposit has these fields null on the
  // FinixFundingTransferAttempt row itself). Same pattern already used by
  // the Settlement detail view (settlementDetail.ts) — matched via the
  // destination payment-instrument id, never by guessing.
  let depositBankAccount: Awaited<ReturnType<typeof prisma.organizationBankAccount.findFirst>> | null = null;
  if (deposit.destinationPaymentInstrumentId && (!deposit.bankName || !deposit.bankAccountType)) {
    depositBankAccount = await prisma.organizationBankAccount.findFirst({
      where: { churchId, finixPaymentInstrumentId: deposit.destinationPaymentInstrumentId },
    });
  }

  // Second fallback tier: OrganizationBankAccount itself can be empty for
  // an org whose payout bank was only ever captured at onboarding time
  // (confirmed against live data — 3 real organizations have real bank
  // details sitting in OnboardingApplication.bankName/bankLast4/
  // bankAccountType with a finixPaymentInstrumentId that matches this
  // exact deposit's destination, but no corresponding
  // OrganizationBankAccount row was ever created). resolveActiveBankAccount
  // already encodes this exact fallback chain (explicit mapping ->
  // instrument snapshot -> onboarding -> deposit history) for the
  // Organization Profile page — reused here rather than re-deriving it,
  // per the "don't duplicate this logic" spirit of that function's own
  // module comment. Only consulted when the narrower lookup above still
  // came up empty, so it costs nothing on the common path.
  let resolvedBankAccount: Awaited<ReturnType<typeof resolveActiveBankAccount>> | null = null;
  if (!depositBankAccount?.bankName && !deposit.bankName) {
    resolvedBankAccount = await resolveActiveBankAccount(churchId);
  }

  return { deposit, church, settlements, payments, affectingRefunds, affectingReturns, depositBankAccount, resolvedBankAccount };
}

type DepositDetail = NonNullable<Awaited<ReturnType<typeof loadDepositDetail>>>;
