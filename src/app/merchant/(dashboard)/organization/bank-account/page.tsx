import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getOrganizationPermissions } from "@/lib/organization/organizationPermissions";
import { resolveActiveBankAccount } from "@/lib/organization/bankAccountResolver";
import { checkPendingFunding } from "@/lib/organization/pendingFundingCheck";
import BankAccountPanel from "@/components/merchant/BankAccountPanel";

export default async function OrganizationBankAccountPage() {
  const session = await getSession();
  const permissions = getOrganizationPermissions(session?.role);
  const [account, pendingFunding, latestDeposit, failedDeposits] = await Promise.all([
    resolveActiveBankAccount(session!.churchId!),
    checkPendingFunding(session!.churchId!),
    prisma.finixFundingTransferAttempt.findFirst({
      where: { churchId: session!.churchId!, state: "COMPLETED" },
      orderBy: { arrivedAt: "desc" },
      select: { arrivedAt: true, state: true, amountCents: true, fundingSpeed: true },
    }),
    prisma.finixFundingTransferAttempt.findMany({
      where: { churchId: session!.churchId!, state: { in: ["FAILED", "RETURNED"] } },
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
