import { redirect } from "next/navigation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { getSettingsPermissions } from "@/lib/settings/settingsPermissions";
import { hasPermission } from "@/lib/auth/permissions";
import AplosIntegrationClient from "@/components/merchant/integrations/AplosIntegrationClient";

/**
 * Page-level gate mirrors every other settings page (getSettingsPermissions
 * .canView, derived from canManageOrgSettings — whether this org member can
 * see the Settings section at all). The Aplos-specific canManageIntegrations
 * permission (owner/admin only, per the approved Checkpoint 2 spec) gates
 * the mutating actions within the client component, not page access itself
 * — a viewer with canView can see status, just not connect/test/disconnect.
 */
export default async function AplosIntegrationPage() {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/dashboard");
    throw err;
  }
  const settingsPermissions = getSettingsPermissions(auth.rawRole);
  if (!settingsPermissions.canView) redirect("/merchant/dashboard");

  const canManage = hasPermission(auth, "canManageIntegrations");

  return <AplosIntegrationClient canManage={canManage} />;
}
