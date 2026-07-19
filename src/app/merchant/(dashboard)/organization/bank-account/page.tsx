import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrganizationPermissions } from "@/lib/organization/organizationPermissions";
import { resolveActiveBankAccount } from "@/lib/organization/bankAccountResolver";
import { checkPendingFunding } from "@/lib/organization/pendingFundingCheck";
import BankAccountPanel from "@/components/merchant/BankAccountPanel";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";

export default async function OrganizationBankAccountPage() {
  // Team-access Checkpoint 4B: previously fetched and rendered bank-account
  // data unconditionally (only the edit button was gated on
  // canUpdateBankAccount) — VIEWER/FUNDRAISER, and even a wgc_admin session
  // via the legacy getSession() path, could see it. Now denies read access
  // before any data fetch, and rejects wgc_admin unconditionally.
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/dashboard");
    throw err;
  }
  const permissions = getOrganizationPermissions(auth.rawRole);
  if (!permissions.canView) {
    redirect("/merchant/dashboard");
  }
  const [account, pendingFunding, latestDeposit, failedDeposits] = await Promise.all([
    resolveActiveBankAccount(auth.churchId),
    checkPendingFunding(auth.churchId),
    prisma.finixFundingTransferAttempt.findFirst({
      where: { churchId: auth.churchId, state: "COMPLETED" },
      orderBy: { arrivedAt: "desc" },
      select: { arrivedAt: true, state: true, amountCents: true, fundingSpeed: true },
    }),
    prisma.finixFundingTransferAttempt.findMany({
      where: { churchId: auth.churchId, state: { in: ["FAILED", "RETURNED"] } },
      orderBy: { createdAtFinix: "desc" },
      take: 10,
      select: { id: true, amountCents: true, failureCode: true, failureMessage: true, createdAtFinix: true, retriedAt: true },
    }),
  ]);

  return (
    <BankAccountPanel
      canUpdateBankAccount={permissions.canUpdateBankAccount}
      initialAccount={
        account
          ? {
              source: account.source,
              isHistoricalFallback: account.isHistoricalFallback,
              bankName: account.bankName,
              accountHolderName: account.accountHolderName,
              last4: account.last4,
              accountType: account.accountType,
              displayStatus: account.displayStatus,
              paymentInstrumentState: account.paymentInstrumentState,
              verificationState: account.verificationState,
              isActivePayoutDestination: account.isActivePayoutDestination,
              addedAt: account.addedAt ? account.addedAt.toISOString() : null,
            }
          : null
      }
      pendingFunding={pendingFunding}
      latestDeposit={
        latestDeposit
          ? {
              arrivedAt: latestDeposit.arrivedAt ? latestDeposit.arrivedAt.toISOString() : null,
              amountCents: latestDeposit.amountCents,
              fundingSpeed: latestDeposit.fundingSpeed,
            }
          : null
      }
      failedPayouts={failedDeposits.map((d) => ({
        id: d.id,
        amountCents: d.amountCents,
        failureCode: d.failureCode,
        failureMessage: d.failureMessage,
        createdAtFinix: d.createdAtFinix ? d.createdAtFinix.toISOString() : null,
        retriedAt: d.retriedAt ? d.retriedAt.toISOString() : null,
      }))}
    />
  );
}
