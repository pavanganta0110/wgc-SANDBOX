import { redirect } from "next/navigation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { hasPermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import WebhookSettingsPanel from "@/components/merchant/WebhookSettingsPanel";

export default async function DeveloperWebhooksPage() {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/login");
    throw err;
  }
  if (!hasPermission(auth, "canManageWebhooks")) redirect("/merchant/settings");

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <h3 className="text-sm font-bold text-slate-900 mb-1">Developer Webhooks</h3>
      <p className="text-xs text-slate-500 mb-6">
        Get notified in your own systems when something happens in WGC — a new donation, a completed campaign, an invoice getting paid, and more.
      </p>
      <WebhookSettingsPanel />
    </div>
  );
}
