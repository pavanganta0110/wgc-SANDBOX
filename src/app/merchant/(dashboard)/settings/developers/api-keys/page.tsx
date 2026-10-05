import { redirect } from "next/navigation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { hasPermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import ApiKeySettingsPanel from "@/components/merchant/ApiKeySettingsPanel";

export default async function ApiKeysPage() {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/login");
    throw err;
  }
  if (!hasPermission(auth, "canManageApiKeys")) redirect("/merchant/settings");

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <h3 className="text-sm font-bold text-slate-900 mb-1">API Keys</h3>
      <p className="text-xs text-slate-500 mb-6">
        Manage keys for the WGC API (/api/v1) — used to build custom integrations, Zapier/Make connections, or your own tools.
      </p>
      <ApiKeySettingsPanel />
    </div>
  );
}
