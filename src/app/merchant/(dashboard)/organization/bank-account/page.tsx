import { getSession } from "@/lib/auth/session";
import { getOrganizationPermissions } from "@/lib/organization/organizationPermissions";
import { resolveActiveBankAccount } from "@/lib/organization/bankAccountResolver";
import { checkPendingFunding } from "@/lib/organization/pendingFundingCheck";
import BankAccountPanel from "@/components/merchant/BankAccountPanel";

export default async function OrganizationBankAccountPage() {
  const session = await getSession();
  const permissions = getOrganizationPermissions(session?.role);
  const [account, pendingFunding] = await Promise.all([
    resolveActiveBankAccount(session!.churchId!),
    checkPendingFunding(session!.churchId!),
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
              addedAt: account.addedAt ? account.addedAt.toISOString() : null,
            }
          : null
      }
      pendingFunding={pendingFunding}
    />
  );
}
