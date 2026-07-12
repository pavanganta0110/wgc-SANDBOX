import { prisma } from "@/lib/prisma";
import { resolveBankAccountDisplayStatus, type BankAccountDisplayStatus } from "@/lib/organization/bankAccountStatus";

export interface ResolvedBankAccount {
  source: "EXPLICIT" | "INSTRUMENT_SNAPSHOT" | "ONBOARDING" | "DEPOSIT_HISTORY";
  isHistoricalFallback: boolean;
  bankName: string | null;
  accountHolderName: string | null;
  last4: string | null;
  accountType: string | null;
  currency: string | null;
  displayStatus: BankAccountDisplayStatus;
  addedAt: Date | null;
  organizationBankAccountId: string | null;
}

/**
 * Resolves the organization's active payout bank account per the fallback
 * order below — no single nullable local field is trusted on its own,
 * since real deposit history can prove a destination relationship exists
 * even when the explicit mapping row hasn't been created/backfilled yet.
 *
 * 1. Explicit active destination mapping (OrganizationBankAccount.isActiveDestination)
 * 2. Processor-authoritative instrument snapshot marked as the payout bank
 * 3. Onboarding-time bank instrument snapshot (OnboardingApplication) — the
 *    only place a Finix bank-instrument ID was persisted before this feature
 * 4. Most recent completed deposit's destination snapshot — explicitly
 *    marked historical, never labeled ACTIVE from this source alone
 */
export async function resolveActiveBankAccount(churchId: string): Promise<ResolvedBankAccount | null> {
  const explicit = await prisma.organizationBankAccount.findFirst({
    where: { churchId, isActiveDestination: true },
    orderBy: { activatedAt: "desc" },
  });
  if (explicit) {
    return {
      source: "EXPLICIT",
      isHistoricalFallback: false,
      bankName: explicit.bankName,
      accountHolderName: explicit.accountHolderName,
      last4: explicit.last4,
      accountType: explicit.accountType,
      currency: explicit.currency,
      displayStatus: resolveBankAccountDisplayStatus(explicit),
      addedAt: explicit.addedAt,
      organizationBankAccountId: explicit.id,
    };
  }

  // IMPORTANT: FinixPaymentInstrumentSnapshot rows for a given churchId
  // include DONOR payment instruments (their own bank accounts used to give)
  // as well as the organization's own payout bank — confirmed against real
  // Test Church data, which has 42 snapshot rows, most of them donor
  // instruments. `instrumentUse` is the only field that distinguishes them,
  // and it's only reliably set when a caller explicitly tags an instrument
  // as "payout_bank" — so this tier must filter on it and would rather
  // return nothing than ever risk surfacing a donor's bank account here.
  const snapshot = await prisma.finixPaymentInstrumentSnapshot.findFirst({
    where: { churchId, instrumentType: "BANK_ACCOUNT", enabled: true, instrumentUse: "payout_bank" },
    orderBy: { updatedAt: "desc" },
  });
  if (snapshot) {
    return {
      source: "INSTRUMENT_SNAPSHOT",
      isHistoricalFallback: false,
      bankName: null,
      accountHolderName: snapshot.accountHolderName,
      last4: snapshot.bankLast4,
      accountType: snapshot.bankAccountType,
      currency: null,
      displayStatus: "ACTIVE",
      addedAt: snapshot.createdAt,
      organizationBankAccountId: null,
    };
  }

  const church = await prisma.church.findUnique({
    where: { id: churchId },
    select: { onboardingApplicationId: true, finixMerchantId: true },
  });
  if (church) {
    // Church.onboardingApplicationId is not a dependable join (confirmed
    // null for real organizations, including Test Church, despite a real
    // OnboardingApplication existing) — fall back to matching by
    // finixMerchantId, which is unique per organization and reliably set.
    const onboarding = church.onboardingApplicationId
      ? await prisma.onboardingApplication.findUnique({ where: { id: church.onboardingApplicationId } })
      : church.finixMerchantId
        ? await prisma.onboardingApplication.findFirst({ where: { finixMerchantId: church.finixMerchantId } })
        : null;
    if (onboarding?.finixPaymentInstrumentId) {
      return {
        source: "ONBOARDING",
        isHistoricalFallback: false,
        bankName: onboarding.bankName,
        accountHolderName: null,
        last4: onboarding.bankLast4,
        accountType: onboarding.bankAccountType,
        currency: onboarding.bankCurrency,
        displayStatus: onboarding.bankInstrumentEnabled ? "ACTIVE" : "UNKNOWN",
        addedAt: onboarding.createdAt,
        organizationBankAccountId: null,
      };
    }
  }

  const latestDeposit = await prisma.finixFundingTransferAttempt.findFirst({
    where: { churchId, state: "COMPLETED" },
    orderBy: { arrivedAt: "desc" },
  });
  if (latestDeposit) {
    return {
      source: "DEPOSIT_HISTORY",
      isHistoricalFallback: true,
      bankName: latestDeposit.bankName,
      accountHolderName: latestDeposit.accountHolderName,
      last4: latestDeposit.bankAccountLast4,
      accountType: latestDeposit.bankAccountType,
      currency: null,
      displayStatus: "UNKNOWN",
      addedAt: latestDeposit.arrivedAt,
      organizationBankAccountId: null,
    };
  }

  return null;
}
