import { redirect } from "next/navigation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { canManageFunds } from "@/lib/giving/fundPermissions";
import ExternalDonationImportWizard from "@/components/merchant/ExternalDonationImportWizard";

export default async function ImportExternalDonationsPage() {
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canImportExternalDonations");
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/donations/external");
    throw err;
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <ExternalDonationImportWizard canManageFunds={canManageFunds(auth)} />
    </div>
  );
}
